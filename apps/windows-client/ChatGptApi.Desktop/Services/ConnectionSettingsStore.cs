using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ChatGptApi.Desktop.Models;

namespace ChatGptApi.Desktop.Services;

public sealed class ConnectionSettingsStore
{
    private sealed class StoredSettings
    {
        public string BaseUrl { get; set; } = "http://127.0.0.1:3030";

        public string AuthToken { get; set; } = string.Empty;

        public string ProviderApiKey { get; set; } = string.Empty;

        public string UserEmail { get; set; } = string.Empty;

        public string UserName { get; set; } = string.Empty;
    }

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        WriteIndented = true
    };

    private readonly string _settingsPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "ChatGptApiDesktop",
        "settings.json");

    public async Task<ConnectionSettings> LoadAsync()
    {
        if (!File.Exists(_settingsPath))
        {
            return new ConnectionSettings();
        }

        await using var stream = File.OpenRead(_settingsPath);
        var stored = await JsonSerializer.DeserializeAsync<StoredSettings>(stream, SerializerOptions)
            ?? new StoredSettings();

        return new ConnectionSettings
        {
            BaseUrl = stored.BaseUrl,
            AuthToken = Unprotect(stored.AuthToken),
            ProviderApiKey = Unprotect(stored.ProviderApiKey),
            UserEmail = stored.UserEmail,
            UserName = stored.UserName
        };
    }

    public async Task SaveAsync(ConnectionSettings settings)
    {
        var directory = Path.GetDirectoryName(_settingsPath);

        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        await using var stream = File.Create(_settingsPath);
        await JsonSerializer.SerializeAsync(stream, new StoredSettings
        {
            BaseUrl = settings.BaseUrl,
            AuthToken = Protect(settings.AuthToken),
            ProviderApiKey = Protect(settings.ProviderApiKey),
            UserEmail = settings.UserEmail,
            UserName = settings.UserName
        }, SerializerOptions);
    }

    private static string Protect(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var bytes = Encoding.UTF8.GetBytes(value);
        var protectedBytes = ProtectedData.Protect(bytes, null, DataProtectionScope.CurrentUser);
        return Convert.ToBase64String(protectedBytes);
    }

    private static string Unprotect(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        try
        {
            var protectedBytes = Convert.FromBase64String(value);
            var bytes = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(bytes);
        }
        catch (FormatException)
        {
            return string.Empty;
        }
        catch (CryptographicException)
        {
            return string.Empty;
        }
    }
}
