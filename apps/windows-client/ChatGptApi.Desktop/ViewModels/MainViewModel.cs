using System.Collections.ObjectModel;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Documents;
using System.Windows.Media;
using ChatGptApi.Desktop.Infrastructure;
using ChatGptApi.Desktop.Models;
using ChatGptApi.Desktop.Services;

namespace ChatGptApi.Desktop.ViewModels;

public sealed class MainViewModel : ObservableObject
{
    private const string AutoProjectDescription = "Optional folder created automatically for standalone chats.";
    private const string AutoProjectName = "General";
    private readonly ChatApiClient _apiClient;
    private readonly ConnectionSettingsStore _settingsStore;
    private static readonly Brush BillingNeutralBrush = new SolidColorBrush(Color.FromRgb(148, 168, 189));
    private static readonly Brush BillingHealthyBrush = new SolidColorBrush(Color.FromRgb(64, 199, 155));
    private static readonly Brush BillingWarningBrush = new SolidColorBrush(Color.FromRgb(237, 170, 64));
    private static readonly Brush BillingDangerBrush = new SolidColorBrush(Color.FromRgb(228, 91, 91));

    private string _authToken = string.Empty;
    private string _baseUrl = ConnectionSettings.DefaultBaseUrl;
    private BillingSummaryDto? _billing;
    private string _currentUserEmail = string.Empty;
    private string _currentUserName = string.Empty;
    private string _draftMessage = string.Empty;
    private bool _isBusy;
    private string _providerApiKey = string.Empty;
    private ChatItem? _selectedChat;
    private ProjectItem? _selectedProject;
    private string _statusMessage = "Create an account or sign in, then add your model key in Settings.";

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
        set
        {
            if (SetProperty(ref _providerApiKey, value))
            {
                OnPropertyChanged(nameof(HasProviderApiKey));
                OnPropertyChanged(nameof(ProviderKeyStatusText));
            }
        }
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
                OnPropertyChanged(nameof(ComposerHintText));
                OnPropertyChanged(nameof(SendButtonText));
            }
        }
    }

    public string SelectedChatTitle => SelectedChat?.Title ?? "Start a new chat";

    public string SelectedChatSubtitle => SelectedChat is null
        ? "Projects are optional folders. Type the first message below and the app will create a chat automatically."
        : $"{SelectedChat.Model} / {SelectedChat.ReasoningEffort}";

    public string ComposerHintText => SelectedChat is null
        ? "Start typing. Press Ctrl+Enter to send. The first message will create a chat automatically."
        : "Write a message. Press Ctrl+Enter to send.";

    public string SendButtonText => SelectedChat is null ? "Start Chat" : "Send";

    public string BillingChipText => _billing is null
        ? "Monthly spend: not loaded yet"
        : $"This month: {FormatRubles(_billing.SpentRub)} / {FormatRubles(_billing.LimitRub)}";

    public string BillingDetailText => _billing is null
        ? "Per-user spend is tracked on the server and resets every month."
        : _billing.IsLimitReached
            ? $"Monthly limit reached for {_billing.PeriodMonth}. New requests will pause until the next month."
            : $"{FormatRubles(_billing.RemainingRub)} left this month. Max reply size: {_billing.MaxOutputTokens} tokens.";

    public Brush BillingBrush => _billing is null
        ? BillingNeutralBrush
        : _billing.IsLimitReached
            ? BillingDangerBrush
            : _billing.SpentRub >= _billing.LimitRub * 0.8
                ? BillingWarningBrush
                : BillingHealthyBrush;

    public bool HasProviderApiKey => !string.IsNullOrWhiteSpace(_providerApiKey);

    public string ProviderKeyStatusText => HasProviderApiKey
        ? "Model API key is saved in Settings on this Windows profile."
        : "Open Settings to add your model API key before sending messages.";

    public bool IsAuthenticated => !string.IsNullOrWhiteSpace(_authToken);

    public bool IsSignedOut => !IsAuthenticated;

    public string CurrentUserStatusText => IsAuthenticated
        ? $"Signed in as {_currentUserName} ({_currentUserEmail})"
        : "Not signed in yet";

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
        StatusMessage = HasProviderApiKey
            ? "Settings saved on this Windows profile."
            : "Settings saved. Add your model key before sending messages.";

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
        StatusMessage = HasProviderApiKey
            ? $"Welcome, {response.User.Name}. Your private workspace is ready."
            : $"Welcome, {response.User.Name}. Open Settings to add your model key.";
    }

    public async Task LoginAsync(string email, string password)
    {
        EnsureBaseUrl();

        var response = await _apiClient.LoginAsync(new ConnectionSettings
        {
            BaseUrl = BaseUrl
        }, email, password);

        await ApplyAuthResponseAsync(response);
        StatusMessage = HasProviderApiKey
            ? $"Signed in as {response.User.Email}."
            : $"Signed in as {response.User.Email}. Open Settings to add your model key.";
    }

    public async Task SendPasswordResetEmailAsync(string email)
    {
        EnsureBaseUrl();
        var response = await _apiClient.SendPasswordResetEmailAsync(new ConnectionSettings
        {
            BaseUrl = BaseUrl
        }, email);
        StatusMessage = response.Message;
    }

    public async Task ResetPasswordAsync(string token, string password)
    {
        EnsureBaseUrl();
        var response = await _apiClient.ResetPasswordAsync(new ConnectionSettings
        {
            BaseUrl = BaseUrl
        }, token, password);
        StatusMessage = response.Message;
    }

    public async Task ChangePasswordAsync(string currentPassword, string newPassword)
    {
        EnsureAuthenticated();
        var response = await _apiClient.ChangePasswordAsync(CurrentSettings(), currentPassword, newPassword);
        StatusMessage = response.Message;
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
            StatusMessage = "Create an account or sign in to load your private projects and chats.";
            return;
        }

        try
        {
            var session = await _apiClient.GetMeAsync(CurrentSettings());
            ApplyUser(session.User);
            ApplyBilling(session.Billing);

            var selectedProjectId = SelectedProject?.Id;
            var selectedChatId = SelectedChat?.Id;
            var projects = await _apiClient.GetProjectsAsync(CurrentSettings());

            ReplaceCollection(Projects, projects.Select(project => new ProjectItem(project)));

            SelectedProject = Projects.FirstOrDefault(project => project.Id == selectedProjectId)
                ?? Projects.FirstOrDefault();

            await LoadChatsForSelectedProjectAsync(selectedChatId);

            StatusMessage = Projects.Count == 0
                ? "No chats yet. Start typing below or use New to create one."
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
        var project = await EnsureProjectForChatAsync();
        var chat = await _apiClient.CreateChatAsync(CurrentSettings(), project.Id, title);
        await LoadChatsForSelectedProjectAsync(chat.Id);
        StatusMessage = $"Created chat: {chat.Title}";
    }

    public void StartNewChat()
    {
        EnsureAuthenticated();
        SelectedChat = null;
        Messages.Clear();
        StatusMessage = SelectedProject is null
            ? "Write the first message below. The app will create a new chat automatically."
            : $"Write the first message below. A new chat will be created inside {SelectedProject.Name}.";
    }

    public async Task SendMessageAsync()
    {
        EnsureAuthenticated();
        EnsureProviderApiKey();

        var content = DraftMessage.Trim();

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidOperationException("Type a message before sending.");
        }

        var chat = await EnsureChatForMessageAsync(content);
        var assistantMessage = default(MessageItem);
        var draftCleared = false;

        await foreach (var envelope in _apiClient.StreamMessageAsync(CurrentSettings(), chat.Id, content))
        {
            switch (envelope.Type)
            {
                case "start":
                    if (!draftCleared)
                    {
                        DraftMessage = string.Empty;
                        draftCleared = true;
                    }

                    if (envelope.UserMessage is not null)
                    {
                        Messages.Add(new MessageItem(envelope.UserMessage));
                    }

                    assistantMessage ??= MessageItem.CreateStreamingAssistant(chat.Model);

                    if (!Messages.Contains(assistantMessage))
                    {
                        Messages.Add(assistantMessage);
                    }

                    StatusMessage = "Receiving reply...";
                    break;

                case "delta":
                    assistantMessage ??= MessageItem.CreateStreamingAssistant(chat.Model);

                    if (!Messages.Contains(assistantMessage))
                    {
                        if (!draftCleared)
                        {
                            DraftMessage = string.Empty;
                            draftCleared = true;
                        }

                        Messages.Add(assistantMessage);
                    }

                    assistantMessage.AppendContent(envelope.Delta);
                    StatusMessage = "Streaming reply...";
                    break;

                case "done":
                    if (envelope.AssistantMessage is not null)
                    {
                        if (assistantMessage is null)
                        {
                            assistantMessage = new MessageItem(envelope.AssistantMessage);
                            Messages.Add(assistantMessage);
                        }
                        else
                        {
                            assistantMessage.Complete(envelope.AssistantMessage);
                        }
                    }

                    ApplyBilling(envelope.Billing);

                    if (envelope.Billing is not null)
                    {
                        StatusMessage = envelope.Billing.IsLimitReached
                            ? $"Reply received. Monthly limit is now exhausted at {FormatRubles(envelope.Billing.SpentRub)}."
                            : $"Reply received. Spent this month: {FormatRubles(envelope.Billing.SpentRub)}.";
                    }

                    break;
            }
        }
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

    private void ApplyBilling(BillingSummaryDto? billing)
    {
        _billing = billing;
        OnPropertyChanged(nameof(BillingChipText));
        OnPropertyChanged(nameof(BillingDetailText));
        OnPropertyChanged(nameof(BillingBrush));
    }

    private async Task PersistSettingsAsync()
    {
        await _settingsStore.SaveAsync(CurrentSettings());
    }

    private async Task<ProjectItem> EnsureProjectForChatAsync()
    {
        if (SelectedProject is not null)
        {
            return SelectedProject;
        }

        if (Projects.Count > 0)
        {
            SelectedProject = Projects[0];
            return SelectedProject;
        }

        var project = await _apiClient.CreateProjectAsync(CurrentSettings(), new CreateProjectRequest
        {
            Name = AutoProjectName,
            Description = AutoProjectDescription
        });

        await ReloadWorkspaceAsync();
        SelectedProject = Projects.FirstOrDefault(item => item.Id == project.Id)
            ?? Projects.FirstOrDefault();

        if (SelectedProject is null)
        {
            throw new InvalidOperationException("Unable to create the default project for the first chat.");
        }

        return SelectedProject;
    }

    private async Task<ChatItem> EnsureChatForMessageAsync(string content)
    {
        if (SelectedChat is not null)
        {
            return SelectedChat;
        }

        var project = await EnsureProjectForChatAsync();
        var chat = await _apiClient.CreateChatAsync(CurrentSettings(), project.Id, CreateAutomaticChatTitle(content));
        await LoadChatsForSelectedProjectAsync(chat.Id);

        return SelectedChat
            ?? throw new InvalidOperationException("Unable to create the first chat automatically.");
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
        OnPropertyChanged(nameof(IsSignedOut));
        OnPropertyChanged(nameof(CurrentUserStatusText));
    }

    private void ClearWorkspace()
    {
        Projects.Clear();
        Chats.Clear();
        Messages.Clear();
        SelectedProject = null;
        SelectedChat = null;
        ApplyBilling(null);
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
            throw new InvalidOperationException("Open Settings and add your model API key before sending requests.");
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

    private static string FormatRubles(double value)
    {
        return $"{value.ToString("0.00", CultureInfo.InvariantCulture)} RUB";
    }

    private static string CreateAutomaticChatTitle(string content)
    {
        var normalized = string.Join(" ", content
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .Trim();

        if (normalized.Length == 0)
        {
            return "New chat";
        }

        return normalized.Length <= 44
            ? normalized
            : $"{normalized[..41].TrimEnd()}...";
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

public sealed class MessageItem : ObservableObject
{
    private static readonly Brush AssistantBackground = new SolidColorBrush(Color.FromRgb(18, 24, 29));
    private static readonly Brush AssistantBorder = new SolidColorBrush(Color.FromRgb(28, 42, 45));
    private static readonly Brush AssistantForeground = new SolidColorBrush(Color.FromRgb(236, 243, 245));
    private static readonly Brush UserBackground = new SolidColorBrush(Color.FromRgb(13, 43, 40));
    private static readonly Brush UserBorder = new SolidColorBrush(Color.FromRgb(26, 87, 79));
    private static readonly Brush UserForeground = new SolidColorBrush(Color.FromRgb(241, 251, 248));
    private FlowDocument _contentDocument = new();
    private string _content = string.Empty;
    private bool _isStreaming;
    private string _timestamp = string.Empty;

    public MessageItem(MessageDto message)
    {
        var isAssistant = string.Equals(message.Role, "assistant", StringComparison.OrdinalIgnoreCase);
        Header = isAssistant ? "GPT-5.4" : "You";
        BubbleAlignment = isAssistant ? HorizontalAlignment.Left : HorizontalAlignment.Right;
        BubbleBackground = isAssistant ? AssistantBackground : UserBackground;
        BubbleBorder = isAssistant ? AssistantBorder : UserBorder;
        Foreground = isAssistant ? AssistantForeground : UserForeground;
        SetFinalContent(message.Content);
        Timestamp = DateTimeOffset.TryParse(message.CreatedAt, out var createdAt)
            ? createdAt.LocalDateTime.ToString("g")
            : message.CreatedAt;
    }

    private MessageItem(string header, string timestamp, HorizontalAlignment alignment, Brush background, Brush border, Brush foreground)
    {
        Header = header;
        BubbleAlignment = alignment;
        BubbleBackground = background;
        BubbleBorder = border;
        Foreground = foreground;
        UpdateStreamingContent(string.Empty);
        Timestamp = timestamp;
    }

    public static MessageItem CreateStreamingAssistant(string model)
    {
        return new MessageItem(
            FormatAssistantHeader(model),
            DateTime.Now.ToString("g"),
            HorizontalAlignment.Left,
            AssistantBackground,
            AssistantBorder,
            AssistantForeground);
    }

    public void AppendContent(string delta)
    {
        if (string.IsNullOrEmpty(delta))
        {
            return;
        }

        UpdateStreamingContent(_content + delta);
    }

    public void Complete(MessageDto message)
    {
        SetFinalContent(message.Content);
        Timestamp = DateTimeOffset.TryParse(message.CreatedAt, out var createdAt)
            ? createdAt.LocalDateTime.ToString("g")
            : message.CreatedAt;
    }

    public string Header { get; }

    public string Content
    {
        get => _content;
        private set => SetProperty(ref _content, value);
    }

    public bool IsStreaming
    {
        get => _isStreaming;
        private set => SetProperty(ref _isStreaming, value);
    }

    public FlowDocument ContentDocument
    {
        get => _contentDocument;
        private set => SetProperty(ref _contentDocument, value);
    }

    public string Timestamp
    {
        get => _timestamp;
        private set => SetProperty(ref _timestamp, value);
    }

    public HorizontalAlignment BubbleAlignment { get; }

    public Brush BubbleBackground { get; }

    public Brush BubbleBorder { get; }

    public Brush Foreground { get; }

    private void UpdateStreamingContent(string value)
    {
        IsStreaming = true;
        Content = value;
    }

    private void SetFinalContent(string value)
    {
        Content = value;
        ContentDocument = MessageDocumentBuilder.Build(value, Foreground);
        IsStreaming = false;
    }

    private static string FormatAssistantHeader(string model)
    {
        if (string.IsNullOrWhiteSpace(model))
        {
            return "GPT-5.4";
        }

        return model
            .Trim()
            .Replace("gpt", "GPT", StringComparison.OrdinalIgnoreCase);
    }
}
