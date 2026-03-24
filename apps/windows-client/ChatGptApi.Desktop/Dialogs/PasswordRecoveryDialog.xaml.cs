using System.Windows;
using ChatGptApi.Desktop.ViewModels;

namespace ChatGptApi.Desktop.Dialogs;

public partial class PasswordRecoveryDialog : Window
{
    private readonly MainViewModel _viewModel;

    public PasswordRecoveryDialog(MainViewModel viewModel)
    {
        InitializeComponent();
        _viewModel = viewModel;
    }

    private async void OnSendEmailClick(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(EmailTextBox.Text))
        {
            MessageBox.Show(this, "Email is required.", "Validation", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        await RunSafeAsync(() => _viewModel.SendPasswordResetEmailAsync(EmailTextBox.Text.Trim()));
    }

    private async void OnResetPasswordClick(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(TokenTextBox.Text))
        {
            MessageBox.Show(this, "Reset token is required.", "Validation", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (string.IsNullOrWhiteSpace(NewPasswordBox.Password) || NewPasswordBox.Password.Length < 8)
        {
            MessageBox.Show(this, "New password must contain at least 8 characters.", "Validation", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var succeeded = await RunSafeAsync(() => _viewModel.ResetPasswordAsync(TokenTextBox.Text.Trim(), NewPasswordBox.Password));

        if (succeeded)
        {
            MessageBox.Show(this, "Password updated. You can sign in with the new password now.", "Success", MessageBoxButton.OK, MessageBoxImage.Information);
            DialogResult = true;
        }
    }

    private void OnCloseClick(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
    }

    private async Task<bool> RunSafeAsync(Func<Task> action)
    {
        try
        {
            await action();
            StatusTextBlock.Text = _viewModel.StatusMessage;
            return true;
        }
        catch (Exception exception)
        {
            StatusTextBlock.Text = exception.Message;
            MessageBox.Show(this, exception.Message, "Password Recovery", MessageBoxButton.OK, MessageBoxImage.Warning);
            return false;
        }
    }
}
