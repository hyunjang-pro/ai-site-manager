/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'Apple SD Gothic Neo',
          'Malgun Gothic',
          'system-ui',
          'sans-serif',
        ],
      },
      fontSize: {
        '2xs': ['12px', '16px'],
        xs: ['13px', '18px'],
        sm: ['13px', '19px'],
        base: ['15px', '23px'],
        lg: ['17px', '25px'],
        xl: ['19px', '27px'],
        '2xl': ['22px', '30px'],
        '3xl': ['26px', '34px'],
        '4xl': ['31px', '38px'],
        '5xl': ['36px', '42px'],
      },
      colors: {
        canvas: '#F2F4F6',
        ink: {
          DEFAULT: '#191F28',
          2: '#4E5968',
          3: '#8B95A1',
          4: '#B0B8C1',
        },
        brand: {
          DEFAULT: '#3182F6',
          strong: '#1B64DA',
          soft: '#E8F3FF',
        },
      },
      minHeight: {
        14: '3.5rem',
        16: '4rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(17,24,39,0.04), 0 8px 24px -16px rgba(17,24,39,0.16)',
        float: '0 12px 32px -14px rgba(17,24,39,0.30)',
        brand: '0 8px 20px -8px rgba(49,130,246,0.55)',
      },
      keyframes: {
        shake: {
          '10%, 90%': { transform: 'translateX(-2px)' },
          '20%, 80%': { transform: 'translateX(3px)' },
          '30%, 50%, 70%': { transform: 'translateX(-6px)' },
          '40%, 60%': { transform: 'translateX(6px)' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shake: 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both',
        rise: 'rise 0.28s ease-out both',
      },
    },
  },
  plugins: [],
};
