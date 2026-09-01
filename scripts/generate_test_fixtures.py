from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUTPUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures"
OUTPUT.mkdir(parents=True, exist_ok=True)


def write_pdf(name: str, pages: list[list[str]]) -> None:
    document = canvas.Canvas(str(OUTPUT / name), pagesize=A4)
    for lines in pages:
        text = document.beginText(54, 790)
        text.setFont("Courier", 10)
        for line in lines:
            text.textLine(line)
        document.drawText(text)
        document.showPage()
    document.save()


write_pdf("rewe-one-page.pdf", [[
    "REWE Markt GmbH", "EUR", "TEST ARTIKEL  12,34 B", "--------------------------------------",
    "SUMME                   EUR      12,34", "======================================",
    "TSE-Start:           2026-08-31T20:55:01.000", "31.08.2026  20:55  Bon-Nr.:9385",
    "Markt:5454  Kasse:2  Bed.:432102",
]])

write_pdf("rewe-two-page.pdf", [[
    "REWE Markt GmbH", "TEST ARTIKEL  20,00 B", "Fortsetzung auf Seite 2",
], [
    "SUMME                   EUR      20,00", "TSE-Start:           2026-01-05T17:56:24.000",
    "05.01.2026  17:56  Bon-Nr.:1001", "Markt:0081  Kasse:4  Bed.:432102",
]])
