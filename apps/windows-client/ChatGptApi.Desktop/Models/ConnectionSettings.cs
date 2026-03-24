namespace ChatGptApi.Desktop.Models;

public sealed class ConnectionSettings
{
    public string BaseUrl { get; set; } = "http://127.0.0.1:3030";

    public string AuthToken { get; set; } = string.Empty;

    public string ProviderApiKey { get; set; } = string.Empty;

    public string UserEmail { get; set; } = string.Empty;

    public string UserName { get; set; } = string.Empty;
}
