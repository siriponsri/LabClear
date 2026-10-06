# Sample lab reports

`thai_lab_reference_v3/` holds six **fictional** Thai laboratory reports in three layouts (A, B, C).
They are the free samples in the app ("Try a synthetic sample") and the image test set in
`scripts/course_eval.py`. No real patient data.

| File | Use |
|---|---|
| `png/*.png` | One report per image (200 dpi), served by `/api/samples/{id}/png` |
| `pdf/*.pdf` | The same reports as PDF |
| `Thai_Lab_Reports_Reference_v3_A4.pdf` | All six on A4 pages, for printing and photographing |
| `expected_results.json` | Answer key used only by the evaluator |
