using System.Windows;

namespace ChatGptApi.Desktop.Dialogs;

public partial class ChangePasswordDialog : Window
{
    public ChangePasswordDialog()
    {
        InitializeComponent();
    }

    public string CurrentPassword { get; private set; } = string.Empty;

    public string NewPassword { get; private set; } = string.Empty;

    private void OnSaveClick(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(CurrentPasswordBox.Password))
        {
            MessageBox.Show(this, "Current password is required.", "Validation", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (string.IsNullOrWhiteSpace(NewPasswordBox.Password) || NewPasswordBox.Password.Length < 8)
        {
            MessageBox.Show(this, "New password must contain at least 8 characters.", "Validation", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (!string.Equals(NewPasswordBox.Password, ConfirmPasswordBox.Password, StringComparison.Ordinal))
        {
            MessageBox.Show(this, "Password confirmation does not match.", "Validation", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        CurrentPassword = CurrentPasswordBox.Password;
        NewPassword = NewPasswordBox.Password;
        DialogResult = true;
    }

    private void OnCancelClick(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
    }
}
