namespace ChatGptApi.Desktop.Models;

public sealed class ConnectionSettings
{
    public const string DefaultBaseUrl = "http://62.109.2.121:3030";

    public string BaseUrl { get; set; } = DefaultBaseUrl;

    public string AuthToken { get; set; } = string.Empty;

    public string ProviderApiKey { get; set; } = string.Empty;

    public string UserEmail { get; set; } = string.Empty;

    public string UserName { get; set; } = string.Empty;
}
