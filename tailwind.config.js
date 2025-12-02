/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            animation: {
                'pulse-border': 'pulse-border 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            },
            keyframes: {
                'pulse-border': {
                    '0%, 100%': { borderColor: 'rgba(147, 51, 234, 0.5)' },
                    '50%': { borderColor: 'rgba(147, 51, 234, 1)' },
                }
            }
        },
    },
    plugins: [],
}
