import React from 'react';
import printConfig from '@/lib/printConfig';
import topLogo from '@/assets/top-logo.png';

const PrintHeader: React.FC = () => {
  return (
    <div className="print-header" aria-hidden>
      <img
        src={topLogo}
        alt="Top Logo"
        className="print-logo-top"
        style={{ width: `${printConfig.topLogoPx}px`, height: 'auto' }}
      />
    </div>
  );
};

export default PrintHeader;
