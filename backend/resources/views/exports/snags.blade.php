<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{{ $title ?? 'Snags Export / تصدير الملاحظات' }}</title>
    <style>
        body {
            font-family: DejaVu Sans, sans-serif;
            font-size: 11px;
            color: #111827;
        }

        h1 {
            margin: 0 0 8px 0;
            font-size: 18px;
        }

        p.meta {
            margin: 0 0 14px 0;
            color: #4b5563;
            font-size: 10px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th, td {
            border: 1px solid #d1d5db;
            padding: 6px;
            vertical-align: top;
        }

        th {
            background: #f3f4f6;
            text-align: left;
        }
    </style>
</head>
<body>
    <h1>{{ $title ?? 'Snags Export / تصدير الملاحظات' }}</h1>
    <p class="meta">
        Generated at / تاريخ الإنشاء: {{ $generatedAt }} | Total rows / إجمالي الصفوف: {{ count($rows) }}
    </p>

    <table>
        <thead>
            <tr>
                @foreach($headings as $heading)
                    <th>{{ $heading }}</th>
                @endforeach
            </tr>
        </thead>
        <tbody>
            @foreach($rows as $row)
                <tr>
                    @foreach($row as $value)
                        <td>{{ $value }}</td>
                    @endforeach
                </tr>
            @endforeach
        </tbody>
    </table>
</body>
</html>
