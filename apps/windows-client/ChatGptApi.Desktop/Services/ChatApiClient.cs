using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using ChatGptApi.Desktop.Models;

namespace ChatGptApi.Desktop.Services;

public sealed class ChatApiClient
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNameCaseInsensitive = true
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

    public Task<UserDto> GetCurrentUserAsync(ConnectionSettings settings) =>
        SendAsync<MeResponse>(settings, HttpMethod.Get, "api/me")
            .ContinueWith(task => task.Result.User, TaskScheduler.Default);

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

    private async Task<T> SendAsync<T>(
        ConnectionSettings settings,
        HttpMethod method,
        string relativePath,
        object? body = null,
        bool requireAuth = true)
    {
        ConfigureClient(settings, requireAuth);

        using var request = new HttpRequestMessage(method, relativePath);

        if (body is not null)
        {
            var json = JsonSerializer.Serialize(body, SerializerOptions);
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");
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

    private void ConfigureClient(ConnectionSettings settings, bool requireAuth)
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

        _httpClient.BaseAddress = new Uri($"{trimmedBaseUrl}/");
        _httpClient.DefaultRequestHeaders.Authorization = requireAuth
            ? new AuthenticationHeaderValue("Bearer", settings.AuthToken.Trim())
            : null;
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
                return errorElement.GetString() ?? fallback ?? "The request failed.";
            }
        }
        catch (JsonException)
        {
        }

        return payload;
    }
}
