using System.Collections.ObjectModel;
using System.Linq;
using System.Windows;
using System.Windows.Media;
using ChatGptApi.Desktop.Infrastructure;
using ChatGptApi.Desktop.Models;
using ChatGptApi.Desktop.Services;

namespace ChatGptApi.Desktop.ViewModels;

public sealed class MainViewModel : ObservableObject
{
    private readonly ChatApiClient _apiClient;
    private readonly ConnectionSettingsStore _settingsStore;

    private string _authToken = string.Empty;
    private string _baseUrl = "http://62.109.2.121:3030";
    private string _currentUserEmail = string.Empty;
    private string _currentUserName = string.Empty;
    private string _draftMessage = string.Empty;
    private bool _isBusy;
    private string _providerApiKey = string.Empty;
    private ChatItem? _selectedChat;
    private ProjectItem? _selectedProject;
    private string _statusMessage = "Register or sign in to load your private projects and chats.";

    public MainViewModel(ChatApiClient apiClient, ConnectionSettingsStore settingsStore)
    {
        _apiClient = apiClient;
        _settingsStore = settingsStore;
    }

    public ObservableCollection<ProjectItem> Projects { get; } = [];

    public ObservableCollection<ChatItem> Chats { get; } = [];

    public ObservableCollection<MessageItem> Messages { get; } = [];

    public string BaseUrl
    {
        get => _baseUrl;
        set => SetProperty(ref _baseUrl, value);
    }

    public string ProviderApiKey
    {
        get => _providerApiKey;
        set => SetProperty(ref _providerApiKey, value);
    }

    public string DraftMessage
    {
        get => _draftMessage;
        set => SetProperty(ref _draftMessage, value);
    }

    public bool IsBusy
    {
        get => _isBusy;
        set => SetProperty(ref _isBusy, value);
    }

    public string StatusMessage
    {
        get => _statusMessage;
        set => SetProperty(ref _statusMessage, value);
    }

    public ProjectItem? SelectedProject
    {
        get => _selectedProject;
        set => SetProperty(ref _selectedProject, value);
    }

    public ChatItem? SelectedChat
    {
        get => _selectedChat;
        set
        {
            if (SetProperty(ref _selectedChat, value))
            {
                OnPropertyChanged(nameof(SelectedChatTitle));
                OnPropertyChanged(nameof(SelectedChatSubtitle));
            }
        }
    }

    public string SelectedChatTitle => SelectedChat?.Title ?? "Pick a chat to start talking";

    public string SelectedChatSubtitle => SelectedChat is null
        ? "Projects and chats are private per signed-in user."
        : $"{SelectedChat.Model} / {SelectedChat.ReasoningEffort}";

    public bool IsAuthenticated => !string.IsNullOrWhiteSpace(_authToken);

    public string CurrentUserStatusText => IsAuthenticated
        ? $"Signed in as {_currentUserName} ({_currentUserEmail})"
        : "Not signed in";

    public async Task InitializeAsync()
    {
        var settings = await _settingsStore.LoadAsync();
        BaseUrl = settings.BaseUrl;
        _authToken = settings.AuthToken;
        ProviderApiKey = settings.ProviderApiKey;
        _currentUserEmail = settings.UserEmail;
        _currentUserName = settings.UserName;
        NotifyAuthStateChanged();

        if (IsAuthenticated)
        {
            await ReloadWorkspaceAsync();
        }
    }

    public async Task SaveSettingsAsync()
    {
        await PersistSettingsAsync();
        StatusMessage = "Connection settings saved on this Windows profile.";

        if (IsAuthenticated)
        {
            await ReloadWorkspaceAsync();
        }
    }

    public async Task RegisterAsync(string name, string email, string password)
    {
        EnsureBaseUrl();

        var response = await _apiClient.RegisterAsync(new ConnectionSettings
        {
            BaseUrl = BaseUrl
        }, name, email, password);

        await ApplyAuthResponseAsync(response);
        StatusMessage = $"Welcome, {response.User.Name}. Your private workspace is ready.";
    }

    public async Task LoginAsync(string email, string password)
    {
        EnsureBaseUrl();

        var response = await _apiClient.LoginAsync(new ConnectionSettings
        {
            BaseUrl = BaseUrl
        }, email, password);

        await ApplyAuthResponseAsync(response);
        StatusMessage = $"Signed in as {response.User.Email}.";
    }

    public async Task LogoutAsync()
    {
        _authToken = string.Empty;
        _currentUserEmail = string.Empty;
        _currentUserName = string.Empty;
        ClearWorkspace();
        NotifyAuthStateChanged();
        await PersistSettingsAsync();
        StatusMessage = "Signed out. Sign in again to access your chats.";
    }

    public async Task ReloadWorkspaceAsync()
    {
        if (!IsAuthenticated)
        {
            ClearWorkspace();
            StatusMessage = "Register or sign in to load your private projects and chats.";
            return;
        }

        try
        {
            var user = await _apiClient.GetCurrentUserAsync(CurrentSettings());
            ApplyUser(user);

            var selectedProjectId = SelectedProject?.Id;
            var selectedChatId = SelectedChat?.Id;
            var projects = await _apiClient.GetProjectsAsync(CurrentSettings());

            ReplaceCollection(Projects, projects.Select(project => new ProjectItem(project)));

            SelectedProject = Projects.FirstOrDefault(project => project.Id == selectedProjectId)
                ?? Projects.FirstOrDefault();

            await LoadChatsForSelectedProjectAsync(selectedChatId);

            StatusMessage = Projects.Count == 0
                ? "No projects yet. Create the first private project to begin."
                : $"Loaded {Projects.Count} private project(s).";
        }
        catch (InvalidOperationException exception) when (IsAuthenticationError(exception.Message))
        {
            await LogoutAsync();
        }
    }

    public async Task LoadChatsForSelectedProjectAsync(string? preferredChatId = null)
    {
        Chats.Clear();
        Messages.Clear();
        SelectedChat = null;

        if (SelectedProject is null || !IsAuthenticated)
        {
            return;
        }

        var chats = await _apiClient.GetChatsAsync(CurrentSettings(), SelectedProject.Id);
        ReplaceCollection(Chats, chats.Select(chat => new ChatItem(chat)));

        SelectedChat = Chats.FirstOrDefault(chat => chat.Id == preferredChatId)
            ?? Chats.FirstOrDefault();

        if (SelectedChat is not null)
        {
            await LoadMessagesForSelectedChatAsync();
        }
    }

    public async Task LoadMessagesForSelectedChatAsync()
    {
        Messages.Clear();

        if (SelectedChat is null || !IsAuthenticated)
        {
            return;
        }

        var messages = await _apiClient.GetMessagesAsync(CurrentSettings(), SelectedChat.Id);
        ReplaceCollection(Messages, messages.Select(message => new MessageItem(message)));
        StatusMessage = $"Loaded {Messages.Count} message(s).";
    }

    public async Task CreateProjectAsync(CreateProjectRequest request)
    {
        EnsureAuthenticated();

        var project = await _apiClient.CreateProjectAsync(CurrentSettings(), request);
        await ReloadWorkspaceAsync();

        SelectedProject = Projects.FirstOrDefault(item => item.Id == project.Id)
            ?? Projects.FirstOrDefault();

        await LoadChatsForSelectedProjectAsync();
        StatusMessage = $"Created project: {project.Name}";
    }

    public async Task CreateChatAsync(string title)
    {
        EnsureAuthenticated();

        if (SelectedProject is null)
        {
            throw new InvalidOperationException("Select a project before creating a chat.");
        }

        var chat = await _apiClient.CreateChatAsync(CurrentSettings(), SelectedProject.Id, title);
        await LoadChatsForSelectedProjectAsync(chat.Id);
        StatusMessage = $"Created chat: {chat.Title}";
    }

    public async Task SendMessageAsync()
    {
        EnsureAuthenticated();
        EnsureProviderApiKey();

        if (SelectedChat is null)
        {
            throw new InvalidOperationException("Select a chat before sending a message.");
        }

        var content = DraftMessage.Trim();

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidOperationException("Type a message before sending.");
        }

        var response = await _apiClient.SendMessageAsync(CurrentSettings(), SelectedChat.Id, content);
        DraftMessage = string.Empty;

        Messages.Add(new MessageItem(response.UserMessage));
        Messages.Add(new MessageItem(response.AssistantMessage));
        StatusMessage = "GPT-5.4 replied successfully.";
    }

    private async Task ApplyAuthResponseAsync(AuthResponse response)
    {
        _authToken = response.Token;
        ApplyUser(response.User);
        NotifyAuthStateChanged();
        await PersistSettingsAsync();
        await ReloadWorkspaceAsync();
    }

    private void ApplyUser(UserDto user)
    {
        _currentUserName = user.Name;
        _currentUserEmail = user.Email;
        NotifyAuthStateChanged();
    }

    private async Task PersistSettingsAsync()
    {
        await _settingsStore.SaveAsync(CurrentSettings());
    }

    private ConnectionSettings CurrentSettings() => new()
    {
        BaseUrl = BaseUrl,
        AuthToken = _authToken,
        ProviderApiKey = ProviderApiKey,
        UserEmail = _currentUserEmail,
        UserName = _currentUserName
    };

    private void NotifyAuthStateChanged()
    {
        OnPropertyChanged(nameof(IsAuthenticated));
        OnPropertyChanged(nameof(CurrentUserStatusText));
    }

    private void ClearWorkspace()
    {
        Projects.Clear();
        Chats.Clear();
        Messages.Clear();
        SelectedProject = null;
        SelectedChat = null;
    }

    private void EnsureAuthenticated()
    {
        if (!IsAuthenticated)
        {
            throw new InvalidOperationException("Register or sign in before using the workspace.");
        }
    }

    private void EnsureProviderApiKey()
    {
        if (string.IsNullOrWhiteSpace(ProviderApiKey))
        {
            throw new InvalidOperationException("Enter your model API key in the desktop app before sending requests.");
        }
    }

    private void EnsureBaseUrl()
    {
        if (string.IsNullOrWhiteSpace(BaseUrl))
        {
            throw new InvalidOperationException("Backend URL is required.");
        }
    }

    private static bool IsAuthenticationError(string message) =>
        message.Contains("Authentication required", StringComparison.OrdinalIgnoreCase)
        || message.Contains("sign in", StringComparison.OrdinalIgnoreCase)
        || message.Contains("session", StringComparison.OrdinalIgnoreCase);

    private static void ReplaceCollection<T>(ObservableCollection<T> target, IEnumerable<T> items)
    {
        target.Clear();

        foreach (var item in items)
        {
            target.Add(item);
        }
    }
}

public sealed class ProjectItem
{
    public ProjectItem(ProjectDto project)
    {
        Id = project.Id;
        Name = project.Name;
        Description = string.IsNullOrWhiteSpace(project.Description)
            ? "No description yet."
            : project.Description;
        Footer = project.ChatCount == 1 ? "1 chat" : $"{project.ChatCount} chats";
    }

    public string Id { get; }

    public string Name { get; }

    public string Description { get; }

    public string Footer { get; }
}

public sealed class ChatItem
{
    public ChatItem(ChatDto chat)
    {
        Id = chat.Id;
        ProjectId = chat.ProjectId;
        Title = chat.Title;
        Model = chat.Model;
        ReasoningEffort = chat.ReasoningEffort;
        Footer = string.IsNullOrWhiteSpace(chat.LastMessageAt)
            ? "Fresh chat"
            : $"Updated {FormatTimestamp(chat.LastMessageAt)}";
    }

    public string Id { get; }

    public string ProjectId { get; }

    public string Title { get; }

    public string Model { get; }

    public string ReasoningEffort { get; }

    public string Footer { get; }

    private static string FormatTimestamp(string value)
    {
        return DateTimeOffset.TryParse(value, out var timestamp)
            ? timestamp.LocalDateTime.ToString("g")
            : value;
    }
}

public sealed class MessageItem
{
    private static readonly Brush AssistantBackground = new SolidColorBrush(Color.FromRgb(242, 225, 199));
    private static readonly Brush AssistantBorder = new SolidColorBrush(Color.FromRgb(205, 167, 120));
    private static readonly Brush UserBackground = new SolidColorBrush(Color.FromRgb(21, 58, 41));
    private static readonly Brush UserBorder = new SolidColorBrush(Color.FromRgb(34, 89, 63));
    private static readonly Brush UserForeground = Brushes.White;

    public MessageItem(MessageDto message)
    {
        Header = string.Equals(message.Role, "assistant", StringComparison.OrdinalIgnoreCase)
            ? "GPT-5.4"
            : "You";
        Content = message.Content;
        Timestamp = DateTimeOffset.TryParse(message.CreatedAt, out var createdAt)
            ? createdAt.LocalDateTime.ToString("g")
            : message.CreatedAt;
        BubbleAlignment = Header == "GPT-5.4" ? HorizontalAlignment.Left : HorizontalAlignment.Right;
        BubbleBackground = Header == "GPT-5.4" ? AssistantBackground : UserBackground;
        BubbleBorder = Header == "GPT-5.4" ? AssistantBorder : UserBorder;
        Foreground = Header == "GPT-5.4" ? Brushes.Black : UserForeground;
    }

    public string Header { get; }

    public string Content { get; }

    public string Timestamp { get; }

    public HorizontalAlignment BubbleAlignment { get; }

    public Brush BubbleBackground { get; }

    public Brush BubbleBorder { get; }

    public Brush Foreground { get; }
}
