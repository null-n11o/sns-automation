import type { AccountAnalysisReport } from '@/types'

interface Props {
  report: AccountAnalysisReport
  accountName: string
}

export function ReportDetail({ report, accountName }: Props) {
  const { summary, weeklyTrend, daysRecent, metricsFailedCount, noPlatformIdCount } = report.report_data

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">{accountName} 分析レポート</h1>
        <p className="text-sm text-gray-500 mt-1">
          生成日時: {new Date(report.generated_at).toLocaleString('ja-JP')}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">全体サマリー</h2>
        <table className="w-full text-sm border-collapse">
          <tbody>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">総投稿数</td>
              <td className="py-1 text-right">{summary.totalPosts.toLocaleString()}件</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">総インプレッション</td>
              <td className="py-1 text-right">{summary.totalImpressions.toLocaleString()}</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">総ライク</td>
              <td className="py-1 text-right">{summary.totalLikes.toLocaleString()}</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">総リプライ</td>
              <td className="py-1 text-right">{summary.totalReplies.toLocaleString()}</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">総リポスト</td>
              <td className="py-1 text-right">{summary.totalReposts.toLocaleString()}</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">平均インプレッション/投稿</td>
              <td className="py-1 text-right">{summary.avgImpressionsAll.toLocaleString()}</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">平均エンゲージメント率</td>
              <td className="py-1 text-right">{summary.avgEngagementRateAll}%</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">メトリクス取得失敗</td>
              <td className="py-1 text-right">{metricsFailedCount}件</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">メトリクス対象外（未連携投稿）</td>
              <td className="py-1 text-right">{noPlatformIdCount}件</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 text-gray-500">データ期間</td>
              <td className="py-1 text-right">
                {summary.oldestPostDate} 〜 {summary.latestPostDate}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">直近{daysRecent}日間のパフォーマンス</h2>
        <table className="w-full text-sm border-collapse">
          <tbody>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">投稿数</td>
              <td className="py-1 text-right">{summary.recentPostsCount}件</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">インプレッション合計</td>
              <td className="py-1 text-right">{summary.recentImpressions.toLocaleString()}</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 pr-4 text-gray-500">ライク合計</td>
              <td className="py-1 text-right">{summary.recentLikes.toLocaleString()}</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 text-gray-500">平均インプレッション/投稿</td>
              <td className="py-1 text-right">{summary.avgImpressionsRecent.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">週次トレンド（直近8週）</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2">
              <th className="text-left py-2 pr-4 font-semibold">週末日</th>
              <th className="text-right py-2 pr-4 font-semibold">投稿数</th>
              <th className="text-right py-2 pr-4 font-semibold">インプレッション</th>
              <th className="text-right py-2 pr-4 font-semibold">ライク</th>
              <th className="text-right py-2 pr-4 font-semibold">平均エンゲ率</th>
              <th className="text-right py-2 font-semibold">フォロワー数</th>
            </tr>
          </thead>
          <tbody>
            {weeklyTrend.map(w => (
              <tr key={w.weekLabel} className="border-b">
                <td className="py-1 pr-4">{w.weekLabel}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{w.postsCount}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{w.impressions.toLocaleString()}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{w.likes.toLocaleString()}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{w.avgEngagementRate}%</td>
                <td className="py-1 text-right tabular-nums">
                  {w.followersCount === null ? '-' : w.followersCount.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">TOP10投稿（インプレッション順・直近30日）</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2">
              <th className="text-left py-2 pr-4 font-semibold">投稿内容</th>
              <th className="text-right py-2 pr-4 font-semibold">インプレ</th>
              <th className="text-right py-2 pr-4 font-semibold">ライク</th>
              <th className="text-right py-2 pr-4 font-semibold">リプライ</th>
              <th className="text-right py-2 pr-4 font-semibold">リポスト</th>
              <th className="text-right py-2 font-semibold">エンゲ率</th>
            </tr>
          </thead>
          <tbody>
            {summary.topByImpressions.map(post => (
              <tr key={post.id} className="border-b">
                <td className="py-1 pr-4 max-w-xs">
                  <p className="line-clamp-2">{post.content}</p>
                </td>
                <td className="py-1 pr-4 text-right tabular-nums">{post.impressions.toLocaleString()}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{post.likes.toLocaleString()}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{post.replies.toLocaleString()}</td>
                <td className="py-1 pr-4 text-right tabular-nums">{post.reposts.toLocaleString()}</td>
                <td className="py-1 text-right tabular-nums">{post.engagementRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">TOP5投稿（エンゲージメント率順・直近30日）</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2">
              <th className="text-left py-2 pr-4 font-semibold">投稿内容</th>
              <th className="text-right py-2 pr-4 font-semibold">エンゲ率</th>
              <th className="text-right py-2 pr-4 font-semibold">インプレ</th>
              <th className="text-right py-2 font-semibold">ライク</th>
            </tr>
          </thead>
          <tbody>
            {summary.topByEngagement.map(post => (
              <tr key={post.id} className="border-b">
                <td className="py-1 pr-4 max-w-xs">
                  <p className="line-clamp-2">{post.content}</p>
                </td>
                <td className="py-1 pr-4 text-right tabular-nums">{post.engagementRate}%</td>
                <td className="py-1 pr-4 text-right tabular-nums">{post.impressions.toLocaleString()}</td>
                <td className="py-1 text-right tabular-nums">{post.likes.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">インサイト分析</h2>
        {report.insights ? (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-1">注目投稿の傾向</h3>
              <p className="text-sm whitespace-pre-wrap">{report.insights.notable_posts}</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">エンゲージメント考察</h3>
              <p className="text-sm whitespace-pre-wrap">{report.insights.engagement_review}</p>
            </div>
            <div>
              <h3 className="font-semibold mb-1">次のアクション</h3>
              <p className="text-sm whitespace-pre-wrap">{report.insights.next_actions}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">インサイト分析は未生成です。</p>
        )}
      </section>
    </div>
  )
}
