import { analyzeFile } from "../services/api";

export default function UploadBox({ onResult }) {
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    const result = await analyzeFile(file);
    onResult(result);
  };

  return (
    <input
      type="file"
      className="border p-2"
      onChange={handleUpload}
    />
  );
}
