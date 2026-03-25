using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;

namespace ChatGptApi.Desktop.Services;

public static class MessageDocumentBuilder
{
    private static readonly Brush HeadingBrush = CreateBrush(0xF3, 0xF7, 0xFA);
    private static readonly Brush BodyBrush = CreateBrush(0xE7, 0xEE, 0xF5);
    private static readonly Brush MutedBrush = CreateBrush(0x9C, 0xAB, 0xBC);
    private static readonly Brush InlineCodeForeground = CreateBrush(0xE8, 0xF0, 0xFA);
    private static readonly Brush InlineCodeBackground = CreateBrush(0x1A, 0x24, 0x2F);
    private static readonly Brush CodeHeaderBackground = CreateBrush(0x10, 0x16, 0x1E);
    private static readonly Brush CodeBackground = CreateBrush(0x0C, 0x12, 0x19);
    private static readonly Brush CodeBorderBrush = CreateBrush(0x23, 0x32, 0x40);
    private static readonly Brush CodeForeground = CreateBrush(0xD7, 0xE1, 0xEA);
    private static readonly Brush CodeKeywordBrush = CreateBrush(0x56, 0x9C, 0xD6);
    private static readonly Brush CodeStringBrush = CreateBrush(0xCE, 0x91, 0x78);
    private static readonly Brush CodeCommentBrush = CreateBrush(0x6A, 0x99, 0x55);
    private static readonly Brush CodeNumberBrush = CreateBrush(0xB5, 0xCE, 0xA8);
    private static readonly Brush CodeFunctionBrush = CreateBrush(0xDC, 0xDC, 0xAA);
    private static readonly Regex OrderedListRegex = new(@"^\s*\d+\.\s+", RegexOptions.Compiled);
    private static readonly Regex BoldRegex = new(@"\*\*(.+?)\*\*", RegexOptions.Compiled);

    private static readonly Dictionary<string, HashSet<string>> KeywordMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["python"] =
        [
            "and", "as", "assert", "async", "await", "break", "class", "continue", "def",
            "del", "elif", "else", "except", "False", "finally", "for", "from", "global",
            "if", "import", "in", "is", "lambda", "None", "nonlocal", "not", "or", "pass",
            "raise", "return", "True", "try", "while", "with", "yield"
        ],
        ["javascript"] =
        [
            "async", "await", "break", "case", "catch", "class", "const", "continue", "debugger",
            "default", "delete", "do", "else", "export", "extends", "false", "finally", "for",
            "from", "function", "if", "import", "in", "let", "new", "null", "return", "super",
            "switch", "this", "throw", "true", "try", "typeof", "var", "while", "yield"
        ],
        ["typescript"] =
        [
            "abstract", "any", "as", "async", "await", "boolean", "break", "case", "catch", "class",
            "const", "continue", "declare", "default", "do", "else", "enum", "export", "extends",
            "false", "finally", "for", "from", "function", "if", "implements", "import", "in",
            "interface", "let", "module", "namespace", "new", "null", "number", "private", "protected",
            "public", "readonly", "return", "string", "super", "switch", "this", "throw", "true",
            "try", "type", "typeof", "var", "void", "while"
        ],
        ["csharp"] =
        [
            "abstract", "async", "await", "bool", "break", "case", "catch", "class", "const",
            "continue", "decimal", "default", "delegate", "do", "double", "else", "enum", "event",
            "false", "finally", "float", "for", "foreach", "if", "in", "int", "interface", "internal",
            "is", "lock", "namespace", "new", "null", "object", "out", "override", "private",
            "protected", "public", "readonly", "ref", "return", "sealed", "static", "string",
            "struct", "switch", "this", "throw", "true", "try", "using", "var", "virtual", "void", "while"
        ],
        ["bash"] =
        [
            "case", "do", "done", "elif", "else", "esac", "fi", "for", "function", "if",
            "in", "select", "then", "time", "until", "while"
        ],
        ["html"] =
        [
            "html", "head", "body", "div", "span", "script", "style", "input", "button",
            "form", "section", "header", "footer", "main", "label", "textarea"
        ],
        ["css"] =
        [
            "display", "position", "absolute", "relative", "fixed", "grid", "flex", "color",
            "background", "padding", "margin", "border", "width", "height", "font-size", "font-family"
        ],
        ["json"] = []
    };

    public static FlowDocument Build(string? markdown, Brush? defaultForeground = null)
    {
        var bodyBrush = defaultForeground ?? BodyBrush;
        var document = new FlowDocument
        {
            FontFamily = new FontFamily("Segoe UI"),
            FontSize = 15,
            Foreground = bodyBrush,
            Background = Brushes.Transparent,
            PagePadding = new Thickness(0),
            TextAlignment = TextAlignment.Left,
            IsHyphenationEnabled = false,
            LineHeight = 22
        };

        if (string.IsNullOrWhiteSpace(markdown))
        {
            document.Blocks.Add(new Paragraph(new Run("..."))
            {
                Margin = new Thickness(0),
                Foreground = MutedBrush
            });
            return document;
        }

        var lines = Normalize(markdown).Split('\n');
        var paragraphBuffer = new List<string>();
        var codeBuffer = new List<string>();
        var inCodeBlock = false;
        var codeLanguage = string.Empty;

        void FlushParagraphBuffer()
        {
            if (paragraphBuffer.Count == 0)
            {
                return;
            }

            AddParagraph(document, string.Join("\n", paragraphBuffer), bodyBrush);
            paragraphBuffer.Clear();
        }

        foreach (var rawLine in lines)
        {
            var line = rawLine ?? string.Empty;

            if (line.StartsWith("```", System.StringComparison.Ordinal))
            {
                if (inCodeBlock)
                {
                    AddCodeBlock(document, codeLanguage, string.Join("\n", codeBuffer));
                    codeBuffer.Clear();
                    inCodeBlock = false;
                    codeLanguage = string.Empty;
                }
                else
                {
                    FlushParagraphBuffer();
                    inCodeBlock = true;
                    codeLanguage = line[3..].Trim();
                }

                continue;
            }

            if (inCodeBlock)
            {
                codeBuffer.Add(line);
                continue;
            }

            if (string.IsNullOrWhiteSpace(line))
            {
                FlushParagraphBuffer();
                continue;
            }

            if (IsSpecialLine(line))
            {
                FlushParagraphBuffer();
                AddSpecialBlock(document, line, bodyBrush);
                continue;
            }

            paragraphBuffer.Add(line);
        }

        if (inCodeBlock)
        {
            AddCodeBlock(document, codeLanguage, string.Join("\n", codeBuffer));
        }

        FlushParagraphBuffer();
        return document;
    }

    private static bool IsSpecialLine(string line)
    {
        return line.StartsWith("### ", System.StringComparison.Ordinal)
            || line.StartsWith("## ", System.StringComparison.Ordinal)
            || line.StartsWith("# ", System.StringComparison.Ordinal)
            || line.StartsWith("- ", System.StringComparison.Ordinal)
            || line.StartsWith("* ", System.StringComparison.Ordinal)
            || OrderedListRegex.IsMatch(line);
    }

    private static void AddSpecialBlock(FlowDocument document, string line, Brush bodyBrush)
    {
        if (line.StartsWith("### ", System.StringComparison.Ordinal))
        {
            AddHeading(document, line[4..], 20);
            return;
        }

        if (line.StartsWith("## ", System.StringComparison.Ordinal))
        {
            AddHeading(document, line[3..], 22);
            return;
        }

        if (line.StartsWith("# ", System.StringComparison.Ordinal))
        {
            AddHeading(document, line[2..], 24);
            return;
        }

        if (line.StartsWith("- ", System.StringComparison.Ordinal) || line.StartsWith("* ", System.StringComparison.Ordinal))
        {
            AddBullet(document, line[2..].Trim(), bodyBrush);
            return;
        }

        if (OrderedListRegex.IsMatch(line))
        {
            AddBullet(document, line.Trim(), bodyBrush, keepPrefix: true);
            return;
        }
    }

    private static void AddHeading(FlowDocument document, string content, double size)
    {
        var paragraph = new Paragraph
        {
            Margin = new Thickness(0, 10, 0, 4),
            FontWeight = FontWeights.SemiBold,
            FontSize = size,
            Foreground = HeadingBrush
        };

        AppendMarkdownInlines(paragraph.Inlines, content, paragraph.Foreground);
        document.Blocks.Add(paragraph);
    }

    private static void AddBullet(FlowDocument document, string content, Brush bodyBrush, bool keepPrefix = false)
    {
        var paragraph = new Paragraph
        {
            Margin = new Thickness(0, 4, 0, 0),
            Foreground = bodyBrush
        };

        paragraph.Inlines.Add(new Run(keepPrefix ? string.Empty : "• "));
        AppendMarkdownInlines(paragraph.Inlines, content, paragraph.Foreground);
        document.Blocks.Add(paragraph);
    }

    private static void AddParagraph(FlowDocument document, string content, Brush bodyBrush)
    {
        var paragraph = new Paragraph
        {
            Margin = new Thickness(0, 8, 0, 0),
            Foreground = bodyBrush
        };

        var lines = content.Split('\n');

        for (var index = 0; index < lines.Length; index += 1)
        {
            AppendMarkdownInlines(paragraph.Inlines, lines[index], paragraph.Foreground);

            if (index < lines.Length - 1)
            {
                paragraph.Inlines.Add(new LineBreak());
            }
        }

        document.Blocks.Add(paragraph);
    }

    private static void AppendMarkdownInlines(InlineCollection target, string content, Brush defaultBrush)
    {
        var remaining = content;

        while (!string.IsNullOrEmpty(remaining))
        {
            var inlineCodeStart = remaining.IndexOf('`');
            var boldMatch = BoldRegex.Match(remaining);

            if (inlineCodeStart == -1 && !boldMatch.Success)
            {
                target.Add(CreateTextRun(remaining, defaultBrush));
                return;
            }

            var nextIndex = inlineCodeStart >= 0
                ? inlineCodeStart
                : int.MaxValue;
            var nextType = "code";

            if (boldMatch.Success && boldMatch.Index < nextIndex)
            {
                nextIndex = boldMatch.Index;
                nextType = "bold";
            }

            if (nextIndex > 0)
            {
                target.Add(CreateTextRun(remaining[..nextIndex], defaultBrush));
                remaining = remaining[nextIndex..];
            }

            if (nextType == "bold")
            {
                var match = BoldRegex.Match(remaining);

                if (!match.Success || match.Index != 0)
                {
                    target.Add(CreateTextRun(remaining, defaultBrush));
                    return;
                }

                var bold = new Bold();
                AppendMarkdownInlines(bold.Inlines, match.Groups[1].Value, defaultBrush);
                target.Add(bold);
                remaining = remaining[match.Length..];
                continue;
            }

            var closingIndex = remaining.IndexOf('`', 1);

            if (closingIndex <= 0)
            {
                target.Add(CreateTextRun(remaining, defaultBrush));
                return;
            }

            var inlineText = remaining[1..closingIndex];
            var inline = new Run(inlineText)
            {
                FontFamily = new FontFamily("Consolas"),
                Foreground = InlineCodeForeground,
                Background = InlineCodeBackground
            };

            target.Add(inline);
            remaining = remaining[(closingIndex + 1)..];
        }
    }

    private static void AddCodeBlock(FlowDocument document, string language, string code)
    {
        var root = new DockPanel
        {
            LastChildFill = true
        };

        var header = new Border
        {
            Background = CodeHeaderBackground,
            BorderBrush = CodeBorderBrush,
            BorderThickness = new Thickness(1, 1, 1, 0),
            CornerRadius = new CornerRadius(14, 14, 0, 0),
            Padding = new Thickness(12, 8, 12, 8),
            Child = new TextBlock
            {
                Text = string.IsNullOrWhiteSpace(language) ? "Code" : language.Trim().ToLowerInvariant(),
                Foreground = MutedBrush,
                FontWeight = FontWeights.SemiBold
            }
        };

        DockPanel.SetDock(header, Dock.Top);
        root.Children.Add(header);

        var codePanel = new StackPanel
        {
            Orientation = Orientation.Vertical
        };

        var codeLines = Normalize(code).Split('\n');

        foreach (var line in codeLines)
        {
            var lineBlock = new TextBlock
            {
                FontFamily = new FontFamily("Consolas"),
                FontSize = 13.5,
                Foreground = CodeForeground,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0)
            };

            foreach (var run in HighlightCodeLine(line, language))
            {
                lineBlock.Inlines.Add(run);
            }

            if (lineBlock.Inlines.Count == 0)
            {
                lineBlock.Inlines.Add(new Run("\u00A0"));
            }

            codePanel.Children.Add(lineBlock);
        }

        var body = new Border
        {
            Background = CodeBackground,
            BorderBrush = CodeBorderBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(0, 0, 14, 14),
            Padding = new Thickness(12, 10, 12, 10),
            Child = codePanel
        };

        root.Children.Add(body);

        document.Blocks.Add(new BlockUIContainer(root)
        {
            Margin = new Thickness(0, 10, 0, 2)
        });
    }

    private static IEnumerable<Run> HighlightCodeLine(string line, string language)
    {
        var normalizedLanguage = NormalizeLanguage(language);
        var keywords = KeywordMap.TryGetValue(normalizedLanguage, out var set)
            ? set
            : KeywordMap["javascript"];
        var commentPrefix = GetCommentPrefix(normalizedLanguage);
        var runs = new List<Run>();
        var index = 0;

        while (index < line.Length)
        {
            if (!string.IsNullOrEmpty(commentPrefix)
                && line[index..].StartsWith(commentPrefix, System.StringComparison.Ordinal))
            {
                runs.Add(CreateCodeRun(line[index..], CodeCommentBrush));
                return runs;
            }

            var current = line[index];

            if (char.IsWhiteSpace(current))
            {
                var start = index;

                while (index < line.Length && char.IsWhiteSpace(line[index]))
                {
                    index += 1;
                }

                runs.Add(CreateCodeRun(line[start..index], CodeForeground));
                continue;
            }

            if (current is '"' or '\'' or '`')
            {
                var start = index;
                var quote = current;
                index += 1;

                while (index < line.Length)
                {
                    if (line[index] == '\\' && index + 1 < line.Length)
                    {
                        index += 2;
                        continue;
                    }

                    if (line[index] == quote)
                    {
                        index += 1;
                        break;
                    }

                    index += 1;
                }

                runs.Add(CreateCodeRun(line[start..index], CodeStringBrush));
                continue;
            }

            if (char.IsDigit(current))
            {
                var start = index;

                while (index < line.Length && (char.IsDigit(line[index]) || line[index] is '.' or '_'))
                {
                    index += 1;
                }

                runs.Add(CreateCodeRun(line[start..index], CodeNumberBrush));
                continue;
            }

            if (char.IsLetter(current) || current is '_' or '$')
            {
                var start = index;

                while (index < line.Length && (char.IsLetterOrDigit(line[index]) || line[index] is '_' or '$' or '-'))
                {
                    index += 1;
                }

                var token = line[start..index];
                var nextNonWhitespace = NextNonWhitespace(line, index);
                var brush = keywords.Contains(token)
                    ? CodeKeywordBrush
                    : nextNonWhitespace == '('
                        ? CodeFunctionBrush
                        : CodeForeground;

                runs.Add(CreateCodeRun(token, brush));
                continue;
            }

            runs.Add(CreateCodeRun(current.ToString(), CodeForeground));
            index += 1;
        }

        return runs;
    }

    private static char NextNonWhitespace(string line, int startIndex)
    {
        for (var index = startIndex; index < line.Length; index += 1)
        {
            if (!char.IsWhiteSpace(line[index]))
            {
                return line[index];
            }
        }

        return '\0';
    }

    private static string NormalizeLanguage(string language)
    {
        var normalized = (language ?? string.Empty).Trim().ToLowerInvariant();

        return normalized switch
        {
            "py" => "python",
            "js" => "javascript",
            "ts" => "typescript",
            "tsx" => "typescript",
            "jsx" => "javascript",
            "cs" => "csharp",
            "sh" => "bash",
            _ => normalized
        };
    }

    private static string GetCommentPrefix(string language)
    {
        return language switch
        {
            "python" or "bash" => "#",
            "javascript" or "typescript" or "csharp" or "css" => "//",
            _ => string.Empty
        };
    }

    private static Run CreateTextRun(string value, Brush brush)
    {
        return new Run(value)
        {
            Foreground = brush
        };
    }

    private static Run CreateCodeRun(string value, Brush brush)
    {
        return new Run(PreserveWhitespace(value))
        {
            Foreground = brush,
            FontFamily = new FontFamily("Consolas")
        };
    }

    private static string PreserveWhitespace(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return value;
        }

        var builder = new StringBuilder(value.Length);

        foreach (var character in value)
        {
            builder.Append(character switch
            {
                ' ' => '\u00A0',
                '\t' => "\u00A0\u00A0\u00A0\u00A0",
                _ => character
            });
        }

        return builder.ToString();
    }

    private static string Normalize(string value)
    {
        return value
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
    }

    private static SolidColorBrush CreateBrush(byte red, byte green, byte blue)
    {
        var brush = new SolidColorBrush(Color.FromRgb(red, green, blue));
        brush.Freeze();
        return brush;
    }
}
