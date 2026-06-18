import { NextResponse } from 'next/server';
import store from '@/lib/store';

export async function GET() {
  try {
    const lostItems = store.getLostItems();
    const foundItems = store.getFoundItems();
    const claims = store.getClaims();
    const allItems = [...lostItems, ...foundItems];

    // Compute metrics
    const totalLost = lostItems.length;
    const totalFound = foundItems.length;
    const totalReports = allItems.length;

    const resolvedItems = allItems.filter(item => item.status === 'RESOLVED');
    const totalResolved = resolvedItems.length;

    const recoveryRate = totalReports > 0 ? Math.round((totalResolved / totalReports) * 100) : 0;

    // Categories counts
    const categories: Record<string, number> = {};
    allItems.forEach(item => {
      categories[item.category] = (categories[item.category] || 0) + 1;
    });

    // Location counts (hotspots)
    const locations: Record<string, number> = {};
    allItems.forEach(item => {
      if (item.location) {
        const locName = item.location.trim();
        locations[locName] = (locations[locName] || 0) + 1;
      }
    });

    const sortedLocations = Object.entries(locations)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Recent items
    const recentItems = allItems
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map(item => ({
        id: item.id,
        itemName: item.itemName,
        category: item.category,
        location: item.location,
        type: item.type,
        status: item.status,
        date: item.date,
      }));

    // Claims summary
    const totalClaims = claims.length;
    const approvedClaims = claims.filter(c => c.status === 'APPROVED').length;
    const pendingClaims = claims.filter(c => c.status === 'PENDING').length;
    const rejectedClaims = claims.filter(c => c.status === 'REJECTED').length;

    return NextResponse.json({
      summary: {
        totalLost,
        totalFound,
        totalResolved,
        totalReports,
        recoveryRate,
        totalClaims,
        approvedClaims,
        pendingClaims,
        rejectedClaims,
      },
      categories: Object.entries(categories).map(([name, value]) => ({ name, value })),
      locations: sortedLocations,
      recentItems,
    });
  } catch (err: any) {
    console.error('Error in api/analytics:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
