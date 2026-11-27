'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Download, Eye, Search, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/design-system/PageHeader';
import { Card } from '@/design-system/Card';
import { Button } from '@/design-system/Button';
import { EmptyState } from '@/design-system/EmptyState';
import { ErrorState } from '@/design-system/ErrorState';
import { LoadingState } from '@/design-system/LoadingState';
import { LibraryService, fetchLibraryResources, type LibraryResource } from '@/services/library.service';

function errorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string; message?: string } } };
  return e?.response?.data?.error || e?.response?.data?.message || fallback;
}

export default function ResearchHubPage() {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [resources, setResources] = useState<LibraryResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResources(await fetchLibraryResources(query ? { search: query } : undefined));
    } catch (err) {
      const message = errorMessage(err, 'Failed to load the institutional repository');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpen = async (resource: LibraryResource, mode: 'view' | 'download') => {
    try {
      if (mode === 'view') await LibraryService.viewResource(resource);
      else await LibraryService.downloadResource(resource);
    } catch (err) {
      toast.error(errorMessage(err, `Failed to ${mode} resource`));
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 min-h-screen">
      <PageHeader
        title="Digital Library & Research Hub"
        subtitle="Explore institutional repositories and course resources."
      />

      <Card padding="20px">
        <form
          className="flex flex-col sm:flex-row gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(searchInput.trim());
          }}
        >
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              aria-label="Search the repository"
              placeholder="Search by title, subject or keyword..."
              className="w-full pl-11 pr-4 py-3 text-xs sm:text-sm border border-neutral-200 rounded-xl outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Button variant="primary" type="submit" className="px-6 h-11">
            Search
          </Button>
        </form>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <h3 className="text-base sm:text-lg font-bold text-neutral-900">Institutional Repository</h3>
          {loading ? (
            <LoadingState lines={5} />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : resources.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={32} />}
              title={query ? 'No matching resources' : 'No resources yet'}
              description={
                query
                  ? `Nothing in the repository matches "${query}".`
                  : 'Resources uploaded to your organization library will appear here.'
              }
            />
          ) : (
            resources.map((item) => (
              <Card key={item.id} padding="20px" className="hover:border-neutral-300 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#e05934] bg-orange-50 px-2 py-0.5 rounded border border-orange-200/60">
                      {item.resourceType}
                    </span>
                    <h4 className="text-sm sm:text-base font-bold text-neutral-900 mt-1.5">{item.title}</h4>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {[
                        item.uploadedBy ? `${item.uploadedBy.firstName} ${item.uploadedBy.lastName}`.trim() : null,
                        item.subject,
                        new Date(item.createdAt).getFullYear(),
                      ]
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpen(item, 'view')}>
                      <Eye size={14} className="mr-1.5" /> View
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleOpen(item, 'download')}>
                      <Download size={14} className="mr-1.5" /> Download
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          <Card padding="24px" className="bg-orange-50/40 border border-orange-200/80 shadow-xs">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#e05934] text-white flex items-center justify-center shadow-sm">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900">AI Research Copilot</h3>
                <p className="text-xs text-neutral-500">Grounded assistance</p>
              </div>
            </div>
            <p className="text-xs text-neutral-600 mb-5 leading-relaxed">
              Literature review and citation tools run in the AI Toolkit against your institution&apos;s indexed documents.
            </p>
            <Link href="/ai-toolkit">
              <Button variant="outline" className="w-full justify-center bg-white text-xs font-semibold">
                Open AI Toolkit
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
