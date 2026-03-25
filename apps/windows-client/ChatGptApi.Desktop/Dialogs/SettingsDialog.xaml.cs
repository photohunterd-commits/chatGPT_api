using System.Windows;

namespace ChatGptApi.Desktop.Dialogs;

public enum SettingsDialogAction
{
    None,
    Register,
    Login,
    ChangePassword,
    Logout
}

public partial class SettingsDialog : Window
{
    public SettingsDialog(string providerApiKey, bool isAuthenticated, string currentUserStatusText)
    {
        InitializeComponent();
        DataContext = this;
        ProviderApiKey = providerApiKey;
        IsAuthenticated = isAuthenticated;
        CurrentUserStatusText = currentUserStatusText;
        ProviderApiKeyBox.Password = providerApiKey;
    }

    public string ProviderApiKey { get; private set; } = string.Empty;

    public bool IsAuthenticated { get; }

    public bool IsSignedOut => !IsAuthenticated;

    public string CurrentUserStatusText { get; }

    public string AccountHintText => IsAuthenticated
        ? "Password and sign-out actions live here now, so the main workspace stays focused on the conversation."
        : "Create an account or sign in here to unlock your private projects and chats.";

    public SettingsDialogAction RequestedAction { get; private set; }

    private void OnSaveClick(object sender, RoutedEventArgs e)
    {
        ProviderApiKey = ProviderApiKeyBox.Password.Trim();
        DialogResult = true;
    }

    private void OnCancelClick(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
    }

    private void OnRegisterClick(object sender, RoutedEventArgs e)
    {
        RequestedAction = SettingsDialogAction.Register;
        DialogResult = false;
    }

    private void OnLoginClick(object sender, RoutedEventArgs e)
    {
        RequestedAction = SettingsDialogAction.Login;
        DialogResult = false;
    }

    private void OnChangePasswordClick(object sender, RoutedEventArgs e)
    {
        RequestedAction = SettingsDialogAction.ChangePassword;
        DialogResult = false;
    }

    private void OnLogoutClick(object sender, RoutedEventArgs e)
    {
        RequestedAction = SettingsDialogAction.Logout;
        DialogResult = false;
    }
}
