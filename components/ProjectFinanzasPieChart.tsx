'use client';

import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { formatCLP } from '@/lib/utils';
import { MASKED_CLP_AMOUNT } from '@/lib/privacy/mask';

export interface ProjectChartDatum {
  name: string;
  value: number;
  color: string;
}

export default function ProjectFinanzasPieChart({
  chartData,
  revealed,
}: {
  chartData: ProjectChartDatum[];
  revealed: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart aria-hidden="true" accessibilityLayer={false} tabIndex={-1}>
        <Pie
          rootTabIndex={-1}
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={4}
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => [revealed ? formatCLP(value) : MASKED_CLP_AMOUNT, '']} />
      </PieChart>
    </ResponsiveContainer>
  );
}
