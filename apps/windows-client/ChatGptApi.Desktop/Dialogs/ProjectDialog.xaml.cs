using System.Windows;
using ChatGptApi.Desktop.Models;

namespace ChatGptApi.Desktop.Dialogs;

public partial class ProjectDialog : Window
{
    public ProjectDialog()
    {
        InitializeComponent();
    }

    public CreateProjectRequest Request { get; private set; } = new();

    private void OnCreateClick(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(NameTextBox.Text))
        {
            MessageBox.Show(this, "Project name is required.", "Validation", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        Request = new CreateProjectRequest
        {
            Name = NameTextBox.Text.Trim(),
            Description = DescriptionTextBox.Text.Trim(),
            SystemPrompt = SystemPromptTextBox.Text.Trim()
        };

        DialogResult = true;
    }

    private void OnCancelClick(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
    }
}
