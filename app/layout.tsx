import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import 'katex/dist/katex.min.css';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://building-physics-data-flow.zhongshaobo2002.chatgpt.site'),
  title: '实验变量数据流',
  description: '建筑物理实验数据血缘编辑与桑基图可视化工具',
  openGraph: {
    title: '实验变量数据流',
    description: '建筑物理实验数据血缘编辑与桑基图可视化工具',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '实验变量数据流网页预览' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '实验变量数据流',
    description: '建筑物理实验数据血缘编辑与桑基图可视化工具',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
