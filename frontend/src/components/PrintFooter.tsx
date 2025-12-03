import React from 'react';
import printConfig from '@/lib/printConfig';
import bottomLogo from '@/assets/bottom-logo.png';

const PrintFooter: React.FC = () => {
  return (
    <div className="print-footer" aria-hidden>
      <img
        src={bottomLogo}
        alt="Bottom Logo"
        className="print-logo-bottom"
        style={{ width: `${printConfig.bottomLogoPx}px`, height: 'auto' }}
      />
    </div>
  );
};

export default PrintFooter;
