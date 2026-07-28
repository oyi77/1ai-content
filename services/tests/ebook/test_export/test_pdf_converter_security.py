import pytest
from pathlib import Path
from services.ebook.export.pdf_converter import PdfConverter


def test_malicious_filename_with_semicolon_command_injection(temp_project_dir):
    project_dir = temp_project_dir / "1"
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "exports").mkdir(exist_ok=True)

    converter = PdfConverter(
        libreoffice_path="/usr/bin/libreoffice", projects_dir=temp_project_dir
    )

    with pytest.raises(ValueError, match="Invalid file path"):
        converter.convert("file.docx; rm -rf /")


def test_malicious_filename_with_command_chaining(temp_project_dir):
    project_dir = temp_project_dir / "1"
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "exports").mkdir(exist_ok=True)

    converter = PdfConverter(
        libreoffice_path="/usr/bin/libreoffice", projects_dir=temp_project_dir
    )

    with pytest.raises(ValueError, match="Invalid file path"):
        converter.convert("file.docx && cat /etc/passwd")


def test_path_traversal_attack(temp_project_dir):
    converter = PdfConverter(
        libreoffice_path="/usr/bin/libreoffice", projects_dir=temp_project_dir
    )

    malicious_path = Path("../../../etc/passwd.docx")

    with pytest.raises(ValueError, match="Invalid file path"):
        converter.convert(malicious_path)


def test_non_docx_extension_rejected(temp_project_dir):
    project_dir = temp_project_dir / "1"
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "exports").mkdir(exist_ok=True)

    pdf_file = project_dir / "exports" / "file.pdf"
    pdf_file.touch()

    converter = PdfConverter(
        libreoffice_path="/usr/bin/libreoffice", projects_dir=temp_project_dir
    )

    with pytest.raises(ValueError, match="File must have one of these extensions"):
        converter.convert(pdf_file)


def test_txt_extension_rejected(temp_project_dir):
    project_dir = temp_project_dir / "1"
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "exports").mkdir(exist_ok=True)

    txt_file = project_dir / "exports" / "file.txt"
    txt_file.touch()

    converter = PdfConverter(
        libreoffice_path="/usr/bin/libreoffice", projects_dir=temp_project_dir
    )

    with pytest.raises(ValueError, match="File must have one of these extensions"):
        converter.convert(txt_file)


def test_valid_docx_file_in_projects_dir_passes_validation(temp_project_dir):
    from unittest.mock import patch, MagicMock

    project_dir = temp_project_dir / "1"
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "exports").mkdir(exist_ok=True)

    valid_file = project_dir / "exports" / "ebook.docx"
    valid_file.touch()

    converter = PdfConverter(
        libreoffice_path="/usr/bin/libreoffice", projects_dir=temp_project_dir
    )

    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stderr="")
        pdf_file = project_dir / "exports" / "ebook.pdf"
        pdf_file.write_bytes(b"%PDF-1.4")

        result = converter.convert(valid_file)

        assert result["pdf"] == pdf_file
        mock_run.assert_called_once()


def test_case_insensitive_docx_extension(temp_project_dir):
    from unittest.mock import patch, MagicMock

    project_dir = temp_project_dir / "1"
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "exports").mkdir(exist_ok=True)

    valid_file = project_dir / "exports" / "ebook.DOCX"
    valid_file.touch()

    converter = PdfConverter(
        libreoffice_path="/usr/bin/libreoffice", projects_dir=temp_project_dir
    )

    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stderr="")
        pdf_file = project_dir / "exports" / "ebook.pdf"
        pdf_file.write_bytes(b"%PDF-1.4")

        result = converter.convert(valid_file)

        assert result["pdf"] == pdf_file


def test_nonexistent_file_rejected(temp_project_dir):
    project_dir = temp_project_dir / "1"
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "exports").mkdir(exist_ok=True)

    nonexistent_file = project_dir / "exports" / "nonexistent.docx"

    converter = PdfConverter(
        libreoffice_path="/usr/bin/libreoffice", projects_dir=temp_project_dir
    )

    with pytest.raises(ValueError, match="File does not exist"):
        converter.convert(nonexistent_file)
