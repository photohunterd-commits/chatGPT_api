using System.Windows;

namespace ChatGptApi.Desktop.Dialogs;

public partial class AuthDialog : Window
{
    public AuthDialog(bool isRegistration)
    {
        InitializeComponent();
        IsRegistration = isRegistration;

        HeaderTextBlock.Text = isRegistration ? "Create Account" : "Sign In";
        SubmitButton.Content = isRegistration ? "Register" : "Sign In";
        NamePanel.Visibility = isRegistration ? Visibility.Visible : Visibility.Collapsed;
        HintTextBlock.Text = isRegistration
            ? "Create a private account so projects and chats are isolated per user."
            : "Sign in to continue with your private projects and chats.";
        Height = isRegistration ? 360 : 300;
    }

    public bool IsRegistration { get; }

    public string DisplayName { get; private set; } = string.Empty;

    public string Email { get; private set; } = string.Empty;

    public string Password { get; private set; } = string.Empty;

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
}
