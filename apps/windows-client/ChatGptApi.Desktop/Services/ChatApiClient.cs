using System.Net.Http;
using System.Net.Http.Headers;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Runtime.CompilerServices;
using ChatGptApi.Desktop.Models;

namespace ChatGptApi.Desktop.Services;

public sealed class ChatApiClient
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient _httpClient = new();

    public Task<AuthResponse> RegisterAsync(ConnectionSettings settings, string name, string email, string password) =>
        SendAsync<AuthResponse>(settings, HttpMethod.Post, "auth/register", new
        {
            name,
            email,
            password
        }, requireAuth: false);

    public Task<AuthResponse> LoginAsync(ConnectionSettings settings, string email, string password) =>
        SendAsync<AuthResponse>(settings, HttpMethod.Post, "auth/login", new
        {
            email,
            password
        }, requireAuth: false);

    public Task<OperationStatusResponse> SendPasswordResetEmailAsync(ConnectionSettings settings, string email) =>
        SendAsync<OperationStatusResponse>(settings, HttpMethod.Post, "auth/forgot-password", new
        {
            email
        }, requireAuth: false);

    public Task<OperationStatusResponse> ResetPasswordAsync(ConnectionSettings settings, string token, string password) =>
        SendAsync<OperationStatusResponse>(settings, HttpMethod.Post, "auth/reset-password", new
        {
            token,
            password
        }, requireAuth: false);

    public Task<OperationStatusResponse> ChangePasswordAsync(
        ConnectionSettings settings,
        string currentPassword,
        string newPassword) =>
        SendAsync<OperationStatusResponse>(settings, HttpMethod.Post, "api/me/password", new
        {
            currentPassword,
            newPassword
        });

    public Task<MeResponse> GetMeAsync(ConnectionSettings settings) =>
        SendAsync<MeResponse>(settings, HttpMethod.Get, "api/me");

    public Task<UserDto> GetCurrentUserAsync(ConnectionSettings settings) =>
        GetMeAsync(settings)
            .ContinueWith(task => task.Result.User, TaskScheduler.Default);

    public Task<BillingSummaryDto> GetBillingAsync(ConnectionSettings settings) =>
        SendAsync<BillingResponse>(settings, HttpMethod.Get, "api/me/billing")
            .ContinueWith(task => task.Result.Billing, TaskScheduler.Default);

    public Task<List<ProjectDto>> GetProjectsAsync(ConnectionSettings settings) =>
        SendAsync<ProjectListResponse>(settings, HttpMethod.Get, "api/projects")
            .ContinueWith(task => task.Result.Items, TaskScheduler.Default);

    public Task<List<ChatDto>> GetChatsAsync(ConnectionSettings settings, string projectId) =>
        SendAsync<ChatListResponse>(settings, HttpMethod.Get, $"api/projects/{projectId}/chats")
            .ContinueWith(task => task.Result.Items, TaskScheduler.Default);

    public Task<List<MessageDto>> GetMessagesAsync(ConnectionSettings settings, string chatId) =>
        SendAsync<MessageListResponse>(settings, HttpMethod.Get, $"api/chats/{chatId}/messages")
            .ContinueWith(task => task.Result.Items, TaskScheduler.Default);

    public Task<ProjectDto> CreateProjectAsync(ConnectionSettings settings, CreateProjectRequest request) =>
        SendAsync<ProjectDto>(settings, HttpMethod.Post, "api/projects", request);

    public Task<ChatDto> CreateChatAsync(ConnectionSettings settings, string projectId, string title) =>
        SendAsync<ChatDto>(settings, HttpMethod.Post, $"api/projects/{projectId}/chats", new { title });

    public Task<MessageSendResponse> SendMessageAsync(ConnectionSettings settings, string chatId, string content) =>
        SendAsync<MessageSendResponse>(settings, HttpMethod.Post, $"api/chats/{chatId}/messages", new { content });

    public async IAsyncEnumerable<MessageStreamEnvelope> StreamMessageAsync(
        ConnectionSettings settings,
        string chatId,
        string content,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var requestUri = BuildRequestUri(settings, $"api/chats/{chatId}/messages/stream", requireAuth: true);
        using var request = new HttpRequestMessage(HttpMethod.Post, requestUri)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { content, source = "desktop" }, SerializerOptions),
                Encoding.UTF8,
                "application/json")
        };

        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.AuthToken.Trim());

        if (!string.IsNullOrWhiteSpace(settings.ProviderApiKey))
        {
            request.Headers.Add("X-Provider-Api-Key", settings.ProviderApiKey.Trim());
        }

        using var response = await _httpClient.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var errorPayload = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new InvalidOperationException(ExtractError(errorPayload, response.ReasonPhrase));
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream, Encoding.UTF8);

        while (!reader.EndOfStream)
        {
            var line = await reader.ReadLineAsync().WaitAsync(cancellationToken);

            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            var envelope = JsonSerializer.Deserialize<MessageStreamEnvelope>(line, SerializerOptions);

            if (envelope is null)
            {
                continue;
            }

            if (string.Equals(envelope.Type, "error", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(string.IsNullOrWhiteSpace(envelope.Error)
                    ? "The server reported a streaming error."
                    : envelope.Error);
            }

            yield return envelope;
        }
    }

    private async Task<T> SendAsync<T>(
        ConnectionSettings settings,
        HttpMethod method,
        string relativePath,
        object? body = null,
        bool requireAuth = true)
    {
        var requestUri = BuildRequestUri(settings, relativePath, requireAuth);
        using var request = new HttpRequestMessage(method, requestUri);

        if (body is not null)
        {
            var json = JsonSerializer.Serialize(body, SerializerOptions);
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        }

        if (requireAuth)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.AuthToken.Trim());
        }

        if (!string.IsNullOrWhiteSpace(settings.ProviderApiKey))
        {
            request.Headers.Add("X-Provider-Api-Key", settings.ProviderApiKey.Trim());
        }

        using var response = await _httpClient.SendAsync(request);
        var payload = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(ExtractError(payload, response.ReasonPhrase));
        }

        var result = JsonSerializer.Deserialize<T>(payload, SerializerOptions);

        if (result is null)
        {
            throw new InvalidOperationException("The server returned an empty payload.");
        }

        return result;
    }

    private static Uri BuildRequestUri(ConnectionSettings settings, string relativePath, bool requireAuth)
    {
        var trimmedBaseUrl = settings.BaseUrl.Trim().TrimEnd('/');

        if (string.IsNullOrWhiteSpace(trimmedBaseUrl))
        {
            throw new InvalidOperationException("Backend URL is required.");
        }

        if (requireAuth && string.IsNullOrWhiteSpace(settings.AuthToken))
        {
            throw new InvalidOperationException("You need to sign in first.");
        }

        return new Uri($"{trimmedBaseUrl}/{relativePath.TrimStart('/')}");
    }

    private static string ExtractError(string payload, string? fallback)
    {
        if (string.IsNullOrWhiteSpace(payload))
        {
            return fallback ?? "The request failed.";
        }

        try
        {
            using var document = JsonDocument.Parse(payload);

            if (document.RootElement.TryGetProperty("error", out var errorElement))
            {
                if (string.Equals(errorElement.GetString(), "Validation failed", StringComparison.OrdinalIgnoreCase)
                    && document.RootElement.TryGetProperty("issues", out var issuesElement)
                    && issuesElement.ValueKind == JsonValueKind.Array)
                {
                    var details = issuesElement
                        .EnumerateArray()
                        .Select(issue =>
                        {
                            var path = issue.TryGetProperty("path", out var pathElement) && pathElement.ValueKind == JsonValueKind.Array
                                ? string.Join(".", pathElement.EnumerateArray().Select(segment => segment.ToString()))
                                : "request";
                            var message = issue.TryGetProperty("message", out var messageElement)
                                ? messageElement.GetString()
                                : null;

                            return string.IsNullOrWhiteSpace(message)
                                ? null
                                : $"{path}: {message}";
                        })
                        .Where(detail => !string.IsNullOrWhiteSpace(detail))
                        .ToArray();

                    if (details.Length > 0)
                    {
                        return string.Join(Environment.NewLine, details);
                    }
                }

                return errorElement.GetString() ?? fallback ?? "The request failed.";
            }
        }
        catch (JsonException)
        {
        }

        return payload;
    }
}

public sealed class BillingResponse
{
    public BillingSummaryDto Billing { get; set; } = new();
}
