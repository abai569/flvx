import type { AnnouncementData } from "@/api";

import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { Card, CardBody, CardHeader } from "@/shadcn-bridge/heroui/card";

interface AnnouncementBannerProps {
  announcement: AnnouncementData;
}

export const AnnouncementBanner = ({
  announcement,
}: AnnouncementBannerProps) => {
  if (!announcement.content) {
    return null;
  }

  return (
    <Card className="mb-6 lg:mb-8 border border-gray-200 dark:border-default-200 shadow-md">
      <CardHeader className="flex gap-3 dark:border-white/20 pb-3">
        <div className="flex items-center gap-2">
          <svg
            aria-hidden="true"
            className="w-5 h-5 text-danger"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              clipRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              fillRule="evenodd"
            />
          </svg>
          <h3 className="text-xl font-bold text-danger-500 dark:text-white tracking-tight">
            公告
          </h3>
        </div>
      </CardHeader>

      {/* 下方正文内容 */}
      <CardBody className="-mt-5 !px-9 pt-4 text-sm text-foreground dark:text-white/90 break-words leading-relaxed">
        <ReactMarkdown
          components={{
            p: ({ children }) => (
              <p className="mb-2 last:mb-0">{children}</p>
            ),
            a: ({ children, href }) => (
              <a
                className="underline decoration-blue-500/70 underline-offset-2 hover:text-blue-700 dark:hover:text-blue-100"
                href={href}
                rel="noopener noreferrer"
                target="_blank"
              >
                {children}
              </a>
            ),
            ul: ({ children }) => (
              <ul className="list-disc pl-5 space-y-1 mb-2 last:mb-0">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal pl-5 space-y-1 mb-2 last:mb-0">
                {children}
              </ol>
            ),
            code: ({ children }) => (
              <code className="font-mono rounded bg-blue-100/80 dark:bg-blue-900/40 px-1 py-0.5 text-[0.92em]">
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre className="mb-2 font-mono overflow-x-auto rounded-md bg-blue-100/70 dark:bg-blue-900/40 p-2.5 text-xs leading-relaxed">
                {children}
              </pre>
            ),
            blockquote: ({ children }) => (
              <blockquote className="mb-2 border-l-2 border-blue-300/80 dark:border-blue-500/60 pl-3 italic">
                {children}
              </blockquote>
            ),
          }}
          rehypePlugins={[rehypeSanitize]}
          remarkPlugins={[remarkGfm]}
        >
          {announcement.content}
        </ReactMarkdown>
      </CardBody>
    </Card>
  );
};