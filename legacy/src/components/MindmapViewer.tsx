import React, { useEffect, useRef } from 'react';
import { Markmap } from 'markmap-view';
import { Transformer } from 'markmap-lib';

const transformer = new Transformer();

export const MindmapViewer = ({ markdown }: { markdown: string }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current) {
      svgRef.current.innerHTML = '';
      const { root } = transformer.transform(markdown);
      Markmap.create(svgRef.current, undefined, root);
    }
  }, [markdown]);

  return (
    <div className="w-full h-[70vh] min-h-[400px] max-h-[600px] border border-slate-200 rounded-2xl overflow-hidden bg-white">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
};
