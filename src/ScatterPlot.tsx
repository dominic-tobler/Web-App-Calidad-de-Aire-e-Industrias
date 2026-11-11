import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface DataPoint {
  x: number;
  y: number;
  id: string;
}

interface ScatterPlotProps {
  data: DataPoint[];
  width?: number;
  height?: number;
}

export const ScatterPlot: React.FC<ScatterPlotProps> = ({
  data,
  width = 600,
  height = 400,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null);

  const margin = { top: 20, right: 20, bottom: 40, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => d.x) as [number, number])
      .range([0, innerWidth])
      .nice();

    const yScale = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => d.y) as [number, number])
      .range([innerHeight, 0])
      .nice();

    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3.axisLeft(yScale);

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis);

    g.append('g').call(yAxis);

    const circles = g
      .selectAll<SVGCircleElement, DataPoint>('circle')
      .data(data, (d) => d.id);

    circles
      .enter()
      .append('circle')
      .attr('cx', (d) => xScale(d.x))
      .attr('cy', (d) => yScale(d.y))
      .attr('r', 0)
      .attr('fill', '#4f46e5')
      .attr('opacity', 0.7)
      .on('mouseenter', function (_, d) {
        d3.select(this)
          .transition()
          .duration(150)
          .attr('r', 8)
          .attr('fill', '#f59e0b');
        setHoveredPoint(d);
      })
      .on('mouseleave', function () {
        d3.select(this)
          .transition()
          .duration(150)
          .attr('r', 5)
          .attr('fill', '#4f46e5');
        setHoveredPoint(null);
      })
      .transition()
      .duration(500)
      .attr('r', 5);
  }, [data, width, height, innerWidth, innerHeight]);

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={svgRef} width={width} height={height} />
      {hoveredPoint && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            padding: '4px 8px',
            background: '#1e293b',
            color: '#fff',
            borderRadius: '4px',
            fontSize: '12px',
          }}
        >
          ID: {hoveredPoint.id} | X: {hoveredPoint.x} | Y: {hoveredPoint.y}
        </div>
      )}
    </div>
  );
};