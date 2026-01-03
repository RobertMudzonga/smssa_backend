Sample import templates for SMSSA backend

Files:
- prospects_example.csv — example headers and two sample prospect rows
- projects_example.csv — example headers and two sample project rows

Notes on headers and mapping

Prospects accepted columns (recommended):
- first_name, last_name, email, phone, company, source
- deal_name, assigned_to
- quote_sent_date (YYYY-MM-DD), quote_amount, professional_fees, deposit_amount
- expected_closing_date (YYYY-MM-DD), status
- pipeline_stage (one of pipeline stage keys: opportunity, quote_requested, quote_sent, first_follow_up, ..., won)

Projects accepted columns (recommended):
- project_name, client_lead_id (optional numeric id linking to an existing lead), client_first_name, client_last_name, company
- visa_type_id (if your app uses visa templates), assigned_user_id
- current_stage (numeric or key depending on your schema), start_date, end_date (YYYY-MM-DD), status, budget

How to import

1) Frontend UI
- Open the Prospects or Projects view in the app and click "Import". Choose one of the sample CSVs or your own Excel/CSV file.
- The frontend uploads the file to `POST /api/import` with `target=prospects` or `target=projects`.

Dry-run / positional mapping

- If your spreadsheet has no header row (or headers are blank), the importer will fall back to positional mapping using a default column order. See the example CSVs for the expected column order.
- You can run a dry-run that only returns the mapped rows (no DB writes) by adding `dryRun=true` to the upload form. The frontend upload form does not currently expose this flag; you can POST with `dryRun=true` to `/api/import` via curl or Postman for validation.

2) Backend script (CLI)
- From the `smssa-backend` folder run:

  npm run import-excel -- sample_imports/prospects_example.csv prospects

  npm run import-excel -- sample_imports/projects_example.csv projects

- The script accepts Excel (.xlsx/.xls) or CSV files. For Excel, you can optionally pass a sheet name as a third argument.

If import fails
- Check server logs (backend) for SQL errors — the importer only inserts columns that exist in the target table.
- If your spreadsheet uses different header names, rename the columns to match the recommended headers or add synonyms to `lib/importer.js`.

Need help mapping your specific file?
- If you want, upload `Pivot Pipeline Analysis.xlsx` (or paste its header row here) and I can add the exact header synonyms to the importer or produce a tailored CSV that matches your data.
