import { Conversation, HelpPost, NewsArticle, Notification, RidePost, Squad, User } from './types';

export const MOCK_CURRENT_USER: User = {
  id: 'me-123',
  phoneNumber: '+910000000000',
  name: 'Aarav Sharma',
  garage: ['Royal Enfield Himalayan 450', 'KTM Duke 390'],
  bikeType: 'Adventure',
  city: 'New Delhi',
  style: 'Touring / Off-road',
  experience: 'Advanced',
  distance: '0km',
  isPro: false,
  avatar: 'https://api.dicebear.com/7.x/avataaars/png?seed=Aarav',
  verified: true,
  typicalRideTime: 'Sundays 6AM - 10AM',
  friends: ['u1'],
  friendRequests: {
    sent: [],
    received: ['u2']
  },
  blockedUserIds: []
};

export const MOCK_USERS: User[] = [
  {
    id: 'u1',
    name: 'Ishani Kapur',
    garage: ['Kawasaki Z900', 'Triumph Trident 660'],
    bikeType: 'Sport',
    city: 'Gurugram',
    style: 'Fast / Spirited',
    experience: 'Advanced',
    distance: '12km',
    isPro: true,
    avatar: 'https://api.dicebear.com/7.x/avataaars/png?seed=Ishani',
    verified: true,
    typicalRideTime: 'Saturday Mornings',
    friends: ['me-123'],
    friendRequests: { sent: [], received: [] },
    blockedUserIds: []
  },
  {
    id: 'u2',
    name: 'Rahul Verma',
    garage: ['BMW R1250GS'],
    bikeType: 'Adventure',
    city: 'Noida',
    style: 'Long Distance',
    experience: 'Pro',
    distance: '25km',
    isPro: false,
    avatar: 'https://api.dicebear.com/7.x/avataaars/png?seed=Rahul',
    verified: true,
    typicalRideTime: 'Early Mornings',
    friends: [],
    friendRequests: { sent: ['me-123'], received: [] },
    blockedUserIds: []
  },
  {
    id: 'u3',
    name: 'Sameer Khan',
    garage: ['Royal Enfield Interceptor 650'],
    bikeType: 'Classic',
    city: 'Faridabad',
    style: 'Chill / City',
    experience: 'Intermediate',
    distance: '18km',
    isPro: false,
    avatar: 'https://api.dicebear.com/7.x/avataaars/png?seed=Sameer',
    verified: false,
    typicalRideTime: 'Evening Cruising',
    friends: [],
    friendRequests: { sent: [], received: [] },
    blockedUserIds: []
  }
];

export const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 'n1',
    type: 'friend_request',
    senderId: 'u2',
    senderName: 'Rahul Verma',
    senderAvatar: 'https://api.dicebear.com/7.x/avataaars/png?seed=Rahul',
    content: 'sent you a friend request',
    timestamp: new Date().toISOString(),
    read: false
  },
  {
    id: 'n2',
    type: 'help_helpful',
    senderId: 'u1',
    senderName: 'Ishani Kapur',
    senderAvatar: 'https://api.dicebear.com/7.x/avataaars/png?seed=Ishani',
    content: 'marked your answer as helpful',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    read: true
  }
];

export const MOCK_RIDES: RidePost[] = [
  {
    id: 'r1',
    creatorId: 'u1',
    creatorName: 'Ishani Kapur',
    creatorAvatar: 'https://api.dicebear.com/7.x/avataaars/png?seed=Ishani',
    type: 'Sunday Morning',
    title: 'Leopard Trail Breakfast Run',
    route: 'Gurugram -> Leopard Trail -> Aravali Hills -> Gurugram',
    routePoints: [
      { lat: 28.4595, lng: 77.0266, label: 'Gurugram' },
      { lat: 28.375, lng: 76.92, label: 'Leopard Trail' },
      { lat: 28.35, lng: 77.1, label: 'Aravali View' }
    ],
    date: '2026-03-16',
    startTime: '05:30 AM',
    maxParticipants: 15,
    currentParticipants: ['u1', 'u2', 'me-123'],
    requests: ['u3'],
    city: 'Gurugram',
    visibility: ['City'],
    costType: 'Split',
    splitTotalAmount: 1800,
    paymentMethod: 'UPI_LINK',
    upiPaymentLink: 'upi://pay?pa=ishani@oksbi&pn=Ishani%20Kapur',
    paymentStatusByUserId: {
      u2: {
        userId: 'u2',
        amount: 900,
        status: 'paid',
        updatedAt: new Date().toISOString(),
        paidAt: new Date().toISOString(),
        method: 'UPI_LINK'
      },
      'me-123': {
        userId: 'me-123',
        amount: 900,
        status: 'pending',
        updatedAt: new Date().toISOString()
      }
    },
    createdAt: new Date().toISOString()
  },
  {
    id: 'r2',
    creatorId: 'u2',
    creatorName: 'Rahul Verma',
    creatorAvatar: 'https://api.dicebear.com/7.x/avataaars/png?seed=Rahul',
    type: 'Long Tour',
    title: 'Yamuna Expressway Blast',
    route: 'Noida -> Jewar -> Mathura -> Noida',
    routePoints: [
      { lat: 28.5355, lng: 77.391, label: 'Noida' },
      { lat: 28.1287, lng: 77.5615, label: 'Jewar Toll' },
      { lat: 27.4924, lng: 77.6737, label: 'Mathura' }
    ],
    date: '2026-03-22',
    startTime: '05:00 AM',
    maxParticipants: 10,
    currentParticipants: ['u2'],
    requests: [],
    city: 'Noida',
    visibility: ['City'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'r3',
    creatorId: 'me-123',
    creatorName: 'Aarav Sharma',
    creatorAvatar: 'https://api.dicebear.com/7.x/avataaars/png?seed=Aarav',
    type: 'Night Ride',
    title: 'Lutyens Heritage Tour',
    route: 'India Gate -> CP -> Rashtrapati Bhavan -> Shanti Path',
    routePoints: [
      { lat: 28.6129, lng: 77.2295, label: 'India Gate' },
      { lat: 28.6304, lng: 77.2177, label: 'Connaught Place' },
      { lat: 28.6143, lng: 77.1994, label: 'Rashtrapati Bhavan' }
    ],
    date: '2026-03-20',
    startTime: '10:00 PM',
    maxParticipants: 20,
    currentParticipants: ['me-123', 'u1'],
    requests: [],
    city: 'New Delhi',
    visibility: ['Friends'],
    createdAt: new Date().toISOString()
  }
];

export const MOCK_HELP: HelpPost[] = [
  {
    id: 'h1',
    creatorId: 'u3',
    creatorName: 'Sameer Khan',
    creatorAvatar: 'https://api.dicebear.com/7.x/avataaars/png?seed=Sameer',
    title: 'Himalayan 450 stalling issues',
    description: 'Anyone else facing sudden stalling in low gears during Delhi heat? Looking for a fix or ECU map suggestions.',
    bikeModel: 'Royal Enfield Himalayan 450',
    category: 'Mechanical',
    resolved: false,
    upvotes: 8,
    replies: [
      {
        id: 'rep1',
        creatorId: 'me-123',
        creatorName: 'Aarav Sharma',
        text: 'Try updating to the latest ECU firmware at the Okhla service center. Fixed it for me.',
        isHelpful: true,
        createdAt: new Date().toISOString()
      }
    ],
    createdAt: new Date().toISOString()
  }
];

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'c1',
    participantId: 'u1',
    participantName: 'Ishani Kapur',
    participantAvatar: 'https://api.dicebear.com/7.x/avataaars/png?seed=Ishani',
    lastMessage: 'Meet at Ambience Mall at 5:15!',
    timestamp: '11:20 AM',
    unreadCount: 1,
    messages: []
  },
  {
    id: 'c2',
    participantId: 'u2',
    participantName: 'Rahul Verma',
    participantAvatar: 'https://api.dicebear.com/7.x/avataaars/png?seed=Rahul',
    lastMessage: 'The Jewar stretch is clear for Saturday.',
    timestamp: 'Yesterday',
    unreadCount: 0,
    messages: []
  }
];

export const MOCK_NEWS: NewsArticle[] = [
  {
    id: 'news-1',
    title: 'Adventure Segment Surges as Mid-Weight Bikes Dominate 2026 Demand',
    source: 'RideWire India',
    url: 'https://example.com/bike-news/adventure-segment-2026',
    image: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&q=80&w=1200',
    publishedAt: new Date(Date.now() - 58 * 60 * 1000).toISOString(),
    summary:
      'Sales momentum is shifting toward 300cc-500cc adventure motorcycles driven by highway touring demand, lower running costs, and better city usability compared to full-size ADV platforms.',
    tags: ['Adventure', 'Sales Trend', '300-500cc', 'India Market'],
    duplicateScore: 0.14,
    relevanceScore: 91,
    viralityScore: 78
  },
  {
    id: 'news-2',
    title: 'Bharat Mobility Safety Update: New ABS Calibration Norms Proposed',
    source: 'MotoPolicy Desk',
    url: 'https://example.com/bike-news/abs-calibration-update',
    image: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&q=80&w=1200',
    publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    summary:
      'Draft guidance recommends stricter low-speed ABS calibration test cycles for urban braking scenarios. OEMs are expected to tune braking maps for mixed-grip roads and wet-season traffic conditions.',
    tags: ['Safety', 'ABS', 'Regulation', 'OEM'],
    duplicateScore: 0.22,
    relevanceScore: 88,
    viralityScore: 64
  },
  {
    id: 'news-3',
    title: 'EV Scooter and E-Motorcycle Charging Interoperability Gains Ground',
    source: 'Grid&Go',
    url: 'https://example.com/bike-news/ev-interoperability',
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=1200',
    publishedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
    summary:
      'Multiple charging providers have moved to interoperable payment and session protocols, reducing fragmentation for riders and improving route planning reliability on long weekend rides.',
    tags: ['EV', 'Charging', 'Interoperability', 'Infra'],
    duplicateScore: 0.11,
    relevanceScore: 84,
    viralityScore: 71
  },
  {
    id: 'news-4',
    title: 'Premium Helmet Demand Climbs with Track-Day Culture Expansion',
    source: 'Throttle Brief',
    url: 'https://example.com/bike-news/helmet-demand-trackday',
    image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=1200',
    publishedAt: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(),
    summary:
      'Riders are increasingly choosing FIM-rated and ECE-certified helmets as weekend circuit events and advanced riding workshops become more mainstream across metro regions.',
    tags: ['Gear', 'Helmet', 'Track Day', 'Safety'],
    duplicateScore: 0.19,
    relevanceScore: 79,
    viralityScore: 67
  }
];

export const MOCK_SQUADS: Squad[] = [
  {
    id: 'sq-1',
    name: 'NCR Touring Pack',
    description: 'Weekend touring squad covering Delhi-NCR and nearby highways. Regular rides to Rajasthan, Uttarakhand, and beyond.',
    creatorId: 'me-123',
    members: ['me-123', 'u1', 'u2'],
    adminIds: ['u1'],
    avatar: 'https://api.dicebear.com/7.x/identicon/png?seed=NCRTouring',
    city: 'New Delhi',
    rideStyles: ['Touring', 'Cafe Racer'],
    joinPermission: 'anyone',
    joinRequests: [],
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'sq-2',
    name: 'Delhi Street Riders',
    description: 'City riders who love exploring hidden lanes, food spots, and heritage routes across Delhi.',
    creatorId: 'u1',
    members: ['u1', 'me-123', 'u3'],
    adminIds: ['u3'],
    avatar: 'https://api.dicebear.com/7.x/identicon/png?seed=DelhiStreet',
    city: 'New Delhi',
    rideStyles: ['City / Urban', 'Night Cruise'],
    joinPermission: 'request_to_join',
    joinRequests: ['u2'],
    createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'sq-3',
    name: 'Himalayan Explorers Club',
    description: 'ADV riders tackling mountain passes, off-road trails, and high-altitude camping. Ladakh dreams live here.',
    creatorId: 'u2',
    members: ['u2', 'u3'],
    adminIds: [],
    avatar: 'https://api.dicebear.com/7.x/identicon/png?seed=HimalayanExp',
    city: 'Pan India',
    rideStyles: ['Adventure / Off-road'],
    joinPermission: 'request_to_join',
    joinRequests: [],
    createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'sq-4',
    name: 'Gurgaon Night Riders',
    description: 'Late-night cruise squad. Quiet roads, good vibes, and chai stops at 2 AM.',
    creatorId: 'u3',
    members: ['u3'],
    adminIds: [],
    avatar: 'https://api.dicebear.com/7.x/identicon/png?seed=GurgaonNight',
    city: 'Gurugram',
    rideStyles: ['Night Cruise', 'Sport'],
    joinPermission: 'anyone',
    joinRequests: [],
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
  }
];
