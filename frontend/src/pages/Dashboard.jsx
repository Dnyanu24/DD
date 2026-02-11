import { useState } from "react";
import { Link } from "react-router-dom";
import UploadBox from "../components/UploadBox";
import SummaryCard from "../components/SummaryCard";

export default function Dashboard() {
  const [data, setData] = useState(null);

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          to="/advantages"
          className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
        >
          View SDAS Advantages
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-4">
        Smart Data Analytics System
      </h1>

      <UploadBox onResult={setData} />

      {data && (
        <div className="grid grid-cols-3 gap-4 mt-6">
          <SummaryCard title="Status" value={data.message} />
          <SummaryCard title="Preview Rows" value={data.preview.length} />
          <SummaryCard title="Saved" value="Yes" />
        </div>
      )}
    </div>
  );
}
