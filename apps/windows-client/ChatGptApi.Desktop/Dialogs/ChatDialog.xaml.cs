using System.Windows;

namespace ChatGptApi.Desktop.Dialogs;

public partial class ChatDialog : Window
{
    public ChatDialog()
    {
        InitializeComponent();
    }

    public string ChatTitle { get; private set; } = "Workspace review";

    private void OnCreateClick(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(TitleTextBox.Text))
        {
            MessageBox.Show(this, "Chat title is required.", "Validation", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        ChatTitle = TitleTextBox.Text.Trim();
        DialogResult = true;
    }

    private void OnCancelClick(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
    }
}
