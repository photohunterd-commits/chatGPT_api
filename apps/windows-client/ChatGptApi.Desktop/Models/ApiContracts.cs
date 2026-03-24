using System.Collections.Generic;

namespace ChatGptApi.Desktop.Models;

public sealed class ProjectDto
{
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public int ChatCount { get; set; }

    public string? LastMessageAt { get; set; }

    public string SystemPrompt { get; set; } = string.Empty;
}

public sealed class ChatDto
{
    public string Id { get; set; } = string.Empty;

    public string ProjectId { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Model { get; set; } = string.Empty;

    public string ReasoningEffort { get; set; } = string.Empty;

    public string? LastMessageAt { get; set; }
}

public sealed class MessageDto
{
    public string Id { get; set; } = string.Empty;

    public string ChatId { get; set; } = string.Empty;

    public string Role { get; set; } = string.Empty;

    public string Content { get; set; } = string.Empty;

    public string Source { get; set; } = string.Empty;

    public string CreatedAt { get; set; } = string.Empty;
}

public sealed class ProjectListResponse
{
    public List<ProjectDto> Items { get; set; } = [];
}

public sealed class ChatListResponse
{
    public List<ChatDto> Items { get; set; } = [];
}

public sealed class MessageListResponse
{
    public List<MessageDto> Items { get; set; } = [];
}

public sealed class MessageSendResponse
{
    public MessageDto UserMessage { get; set; } = new();

    public MessageDto AssistantMessage { get; set; } = new();
}

public sealed class UserDto
{
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;
}

public sealed class AuthResponse
{
    public string Token { get; set; } = string.Empty;

    public UserDto User { get; set; } = new();
}

public sealed class MeResponse
{
    public UserDto User { get; set; } = new();
}

public sealed class CreateProjectRequest
{
    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public string SystemPrompt { get; set; } = string.Empty;
}
