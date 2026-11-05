"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function LeaveTrendChart({
  data,
}: {
  data: Array<{ monthKey: string; monthLabel: string; totalLeaves: number; lateMarks: number }>;
}) {
  if (data.length === 0) {
    return (
      <div className="grid h-[300px] place-items-center rounded-lg border border-dashed border-[#e5e7eb] bg-[#fafafa] text-center text-[13px] text-[#9ca3af]">
        Upload a monthly workbook to see leave and late mark trends here.
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full">
      <div className="mb-3 flex items-center gap-4 text-[12px] font-medium text-[#6b7280]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#111827]" /> Total leaves
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#9ca3af]" /> Late marks
        </span>
      </div>
      <ResponsiveContainer width="100%" height="90%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
          <XAxis dataKey="monthLabel" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
          <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(0, 0, 0, 0.03)" }}
            contentStyle={{
              borderRadius: 6,
              borderColor: "#e5e7eb",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.07)",
              fontSize: 12,
              padding: "8px 12px",
            }}
          />
          <Bar dataKey="totalLeaves" name="Total leaves" fill="#111827" radius={[4, 4, 0, 0]} />
          <Bar dataKey="lateMarks" name="Late marks" fill="#9ca3af" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
