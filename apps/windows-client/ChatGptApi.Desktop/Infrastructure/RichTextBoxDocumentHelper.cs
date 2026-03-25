using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;

namespace ChatGptApi.Desktop.Infrastructure;

public static class RichTextBoxDocumentHelper
{
    public static readonly DependencyProperty BoundDocumentProperty =
        DependencyProperty.RegisterAttached(
            "BoundDocument",
            typeof(FlowDocument),
            typeof(RichTextBoxDocumentHelper),
            new PropertyMetadata(null, OnBoundDocumentChanged));

    public static FlowDocument? GetBoundDocument(DependencyObject obj)
    {
        return (FlowDocument?)obj.GetValue(BoundDocumentProperty);
    }

    public static void SetBoundDocument(DependencyObject obj, FlowDocument? value)
    {
        obj.SetValue(BoundDocumentProperty, value);
    }

    private static void OnBoundDocumentChanged(DependencyObject dependencyObject, DependencyPropertyChangedEventArgs eventArgs)
    {
        if (dependencyObject is not RichTextBox richTextBox)
        {
            return;
        }

        richTextBox.Document = eventArgs.NewValue as FlowDocument ?? new FlowDocument();
    }
}
