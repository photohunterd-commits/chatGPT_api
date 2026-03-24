using System.Windows;
using ChatGptApi.Desktop.ViewModels;

namespace ChatGptApi.Desktop.Dialogs;

public partial class AuthDialog : Window
{
    private readonly MainViewModel _viewModel;

    public AuthDialog(MainViewModel viewModel, bool isRegistration)
    {
        InitializeComponent();
        _viewModel = viewModel;
        IsRegistration = isRegistration;

        HeaderTextBlock.Text = isRegistration ? "Create Account" : "Sign In";
        Title = isRegistration ? "Create Account" : "Sign In";
        SubmitButton.Content = isRegistration ? "Register" : "Sign In";
        NamePanel.Visibility = isRegistration ? Visibility.Visible : Visibility.Collapsed;
        ForgotPasswordButton.Visibility = isRegistration ? Visibility.Collapsed : Visibility.Visible;
        HintTextBlock.Text = isRegistration
            ? "Create your account first. You can add the model API key in Settings right after registration."
            : "Sign in to continue with your private projects and chats.";
        MinHeight = isRegistration ? 470 : 390;
    }

    public bool IsRegistration { get; }

    public string DisplayName { get; private set; } = string.Empty;

    public string Email { get; private set; } = string.Empty;

    public string Password { get; private set; } = string.Empty;

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (IsRegistration)
        {
            NameTextBox.Focus();
            return;
        }

        EmailTextBox.Focus();
    }

    private void OnSubmitClick(object sender, RoutedEventArgs e)
    {
        if (IsRegistration && string.IsNullOrWhiteSpace(NameTextBox.Text))
        {
            MessageBox.Show(this, "Name is required.", "Validation", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (string.IsNullOrWhiteSpace(EmailTextBox.Text))
        {
            MessageBox.Show(this, "Email is required.", "Validation", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (string.IsNullOrWhiteSpace(PasswordBox.Password) || PasswordBox.Password.Length < 8)
        {
            MessageBox.Show(this, "Password must contain at least 8 characters.", "Validation", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        DisplayName = NameTextBox.Text.Trim();
        Email = EmailTextBox.Text.Trim();
        Password = PasswordBox.Password;
        DialogResult = true;
    }

    private void OnCancelClick(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
    }

    private void OnForgotPasswordClick(object sender, RoutedEventArgs e)
    {
        var dialog = new PasswordRecoveryDialog(_viewModel)
        {
            Owner = this
        };

        dialog.ShowDialog();
    }
}
