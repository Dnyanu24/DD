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
      className="border border-gray-600 bg-gray-700 text-white p-2 rounded"
      onChange={handleUpload}
    />
  );
}
