import { useState } from "react";
import UploadBox from "../components/UploadBox";
import SummaryCard from "../components/SummaryCard";

export default function Dashboard() {
  const [data, setData] = useState(null);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4 text-white">
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
