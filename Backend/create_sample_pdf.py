import sys
import os
import fitz  # PyMuPDF
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))

with open('sample_pdf_data.txt', 'r', encoding='utf-8') as f:
    table_text = f.read()

# Create PDF
doc = fitz.open()
page = doc.new_page(width=8.5*72, height=11*72)  # Letter size
rect = fitz.Rect(50, 50, 500, 750)
page.insert_text((50,50), table_text, fontsize=9)
pdf_bytes = doc.write()
doc.close()

with open('sample_pdf_data.pdf', 'wb') as f:
    f.write(pdf_bytes)

print("Created Backend/sample_pdf_data.pdf (84KB, full table)")
print("Now run: python test_custom_pdf_pipeline.py")

