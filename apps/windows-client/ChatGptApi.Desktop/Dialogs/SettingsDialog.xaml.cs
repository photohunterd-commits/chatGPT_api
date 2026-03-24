using System.Windows;

namespace ChatGptApi.Desktop.Dialogs;

public partial class SettingsDialog : Window
{
    public SettingsDialog(string providerApiKey)
    {
        InitializeComponent();
        ProviderApiKey = providerApiKey;
        ProviderApiKeyBox.Password = providerApiKey;
    }

    public string ProviderApiKey { get; private set; } = string.Empty;

    private void OnSaveClick(object sender, RoutedEventArgs e)
    {
        ProviderApiKey = ProviderApiKeyBox.Password.Trim();
        DialogResult = true;
    }

    private void OnCancelClick(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
    }
}
