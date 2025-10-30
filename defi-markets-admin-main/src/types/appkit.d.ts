declare namespace JSX {
  interface IntrinsicElements {
    'appkit-button': {
      size?: 'sm' | 'md' | 'lg';
      label?: string;
      loadingLabel?: string;
      disabled?: boolean;
      balance?: boolean;
      namespace?: string;
      onClick?: () => void;
    };
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'appkit-button': {
        size?: 'sm' | 'md' | 'lg';
        label?: string;
        loadingLabel?: string;
        disabled?: boolean;
        balance?: boolean;
        namespace?: string;
        onClick?: () => void;
      };
    }
  }
}
