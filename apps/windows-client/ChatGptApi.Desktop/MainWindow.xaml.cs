using System.Windows;
using System.Windows.Input;
using ChatGptApi.Desktop.Dialogs;
using ChatGptApi.Desktop.Services;
using ChatGptApi.Desktop.ViewModels;

namespace ChatGptApi.Desktop;

public partial class MainWindow : Window
{
    private readonly MainViewModel _viewModel;

    public MainWindow()
    {
        InitializeComponent();
        _viewModel = new MainViewModel(new ChatApiClient(), new ConnectionSettingsStore());
        DataContext = _viewModel;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        await RunSafeAsync(_viewModel.InitializeAsync);
        ProviderApiKeyBox.Password = _viewModel.ProviderApiKey;
    }

    private async void OnSaveSettingsClick(object sender, RoutedEventArgs e)
    {
        await RunSafeAsync(_viewModel.SaveSettingsAsync);
    }

    private async void OnRefreshClick(object sender, RoutedEventArgs e)
    {
        await RunSafeAsync(_viewModel.ReloadWorkspaceAsync);
    }

    private async void OnRegisterClick(object sender, RoutedEventArgs e)
    {
        var dialog = new AuthDialog(isRegistration: true)
        {
            Owner = this
        };

        if (dialog.ShowDialog() == true)
        {
            await RunSafeAsync(() => _viewModel.RegisterAsync(dialog.DisplayName, dialog.Email, dialog.Password));
        }
    }

    private async void OnLoginClick(object sender, RoutedEventArgs e)
    {
        var dialog = new AuthDialog(isRegistration: false)
        {
            Owner = this
        };

        if (dialog.ShowDialog() == true)
        {
            await RunSafeAsync(() => _viewModel.LoginAsync(dialog.Email, dialog.Password));
        }
    }

    private async void OnLogoutClick(object sender, RoutedEventArgs e)
    {
        await RunSafeAsync(_viewModel.LogoutAsync);
    }

    private void OnProviderApiKeyChanged(object sender, RoutedEventArgs e)
    {
        _viewModel.ProviderApiKey = ProviderApiKeyBox.Password;
    }

    private async void OnProjectSelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (!IsLoaded)
        {
            return;
        }

        await RunSafeAsync(() => _viewModel.LoadChatsForSelectedProjectAsync());
    }

    private async void OnChatSelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (!IsLoaded)
        {
            return;
        }

        await RunSafeAsync(_viewModel.LoadMessagesForSelectedChatAsync);
    }

    private async void OnCreateProjectClick(object sender, RoutedEventArgs e)
    {
        var dialog = new ProjectDialog
        {
            Owner = this
        };

        if (dialog.ShowDialog() == true)
        {
            await RunSafeAsync(() => _viewModel.CreateProjectAsync(dialog.Request));
        }
    }

    private async void OnCreateChatClick(object sender, RoutedEventArgs e)
    {
        var dialog = new ChatDialog
        {
            Owner = this
        };

        if (dialog.ShowDialog() == true)
        {
            await RunSafeAsync(() => _viewModel.CreateChatAsync(dialog.ChatTitle));
        }
    }

    private async void OnSendMessageClick(object sender, RoutedEventArgs e)
    {
        await RunSafeAsync(_viewModel.SendMessageAsync);
    }

    private async void OnDraftKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter && Keyboard.Modifiers == ModifierKeys.Control)
        {
            e.Handled = true;
            await RunSafeAsync(_viewModel.SendMessageAsync);
        }
    }

    private async Task RunSafeAsync(Func<Task> action)
    {
        try
        {
            _viewModel.IsBusy = true;
            await action();
        }
        catch (Exception exception)
        {
            _viewModel.StatusMessage = exception.Message;
            MessageBox.Show(this, exception.Message, GetErrorCaption(exception.Message), MessageBoxButton.OK, GetErrorIcon(exception.Message));
        }
        finally
        {
            _viewModel.IsBusy = false;
        }
    }

    private static string GetErrorCaption(string message)
    {
        if (message.Contains("balance", StringComparison.OrdinalIgnoreCase)
            || message.Contains("quota", StringComparison.OrdinalIgnoreCase)
            || message.Contains("API key", StringComparison.OrdinalIgnoreCase))
        {
            return "Model API Key Notice";
        }

        return "Action failed";
    }

    private static MessageBoxImage GetErrorIcon(string message)
    {
        if (message.Contains("balance", StringComparison.OrdinalIgnoreCase)
            || message.Contains("quota", StringComparison.OrdinalIgnoreCase)
            || message.Contains("API key", StringComparison.OrdinalIgnoreCase))
        {
            return MessageBoxImage.Warning;
        }

        return MessageBoxImage.Error;
    }
}
