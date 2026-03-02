import React, { createContext, useContext, useState } from 'react';

import { LocationMode, PermissionStatus, Tab, Theme } from '../app/ui';
import {
  MOCK_CONVERSATIONS,
  MOCK_CURRENT_USER,
  MOCK_HELP,
  MOCK_NEWS,
  MOCK_NOTIFICATIONS,
  MOCK_RIDES,
  MOCK_USERS
} from '../constants';
import { Conversation, HelpPost, NewsArticle, Notification, RidePost, User } from '../types';

type FeedFilter = 'rides' | 'help';

type AppStateContextValue = {
  hydrated: boolean;
  setHydrated: React.Dispatch<React.SetStateAction<boolean>>;
  isLoggedIn: boolean;
  setIsLoggedIn: React.Dispatch<React.SetStateAction<boolean>>;
  theme: Theme;
  setTheme: React.Dispatch<React.SetStateAction<Theme>>;
  activeTab: Tab;
  setActiveTab: React.Dispatch<React.SetStateAction<Tab>>;
  feedFilter: FeedFilter;
  setFeedFilter: React.Dispatch<React.SetStateAction<FeedFilter>>;
  currentUser: User;
  setCurrentUser: React.Dispatch<React.SetStateAction<User>>;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  rides: RidePost[];
  setRides: React.Dispatch<React.SetStateAction<RidePost[]>>;
  helpPosts: HelpPost[];
  setHelpPosts: React.Dispatch<React.SetStateAction<HelpPost[]>>;
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  newsArticles: NewsArticle[];
  setNewsArticles: React.Dispatch<React.SetStateAction<NewsArticle[]>>;
  locationMode: LocationMode;
  setLocationMode: React.Dispatch<React.SetStateAction<LocationMode>>;
  locationPermissionStatus: PermissionStatus;
  setLocationPermissionStatus: React.Dispatch<React.SetStateAction<PermissionStatus>>;
  notificationPermissionStatus: PermissionStatus;
  setNotificationPermissionStatus: React.Dispatch<React.SetStateAction<PermissionStatus>>;
  isDetectingLocation: boolean;
  setIsDetectingLocation: React.Dispatch<React.SetStateAction<boolean>>;
  isNotificationsOpen: boolean;
  setIsNotificationsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isLocationModalOpen: boolean;
  setIsLocationModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  manualCityInput: string;
  setManualCityInput: React.Dispatch<React.SetStateAction<string>>;
  isCreateMenuOpen: boolean;
  setIsCreateMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isCreateRideModalOpen: boolean;
  setIsCreateRideModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isCreateHelpModalOpen: boolean;
  setIsCreateHelpModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isEditProfileOpen: boolean;
  setIsEditProfileOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isRideDetailOpen: boolean;
  setIsRideDetailOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedRideId: string | null;
  setSelectedRideId: React.Dispatch<React.SetStateAction<string | null>>;
  isHelpDetailOpen: boolean;
  setIsHelpDetailOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedHelpPost: HelpPost | null;
  setSelectedHelpPost: React.Dispatch<React.SetStateAction<HelpPost | null>>;
  activeConversation: Conversation | null;
  setActiveConversation: React.Dispatch<React.SetStateAction<Conversation | null>>;
  selectedUserId: string | null;
  setSelectedUserId: React.Dispatch<React.SetStateAction<string | null>>;
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

export const AppStateProvider = ({ children }: { children: React.ReactNode }) => {
  const [hydrated, setHydrated] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('rides');

  const [currentUser, setCurrentUser] = useState<User>(MOCK_CURRENT_USER);
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [rides, setRides] = useState<RidePost[]>(MOCK_RIDES);
  const [helpPosts, setHelpPosts] = useState<HelpPost[]>(MOCK_HELP);
  const [conversations, setConversations] = useState<Conversation[]>(MOCK_CONVERSATIONS);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>(MOCK_NEWS);
  const [locationMode, setLocationMode] = useState<LocationMode>('auto');
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [notificationPermissionStatus, setNotificationPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [manualCityInput, setManualCityInput] = useState('');
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [isCreateRideModalOpen, setIsCreateRideModalOpen] = useState(false);
  const [isCreateHelpModalOpen, setIsCreateHelpModalOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);

  const [isRideDetailOpen, setIsRideDetailOpen] = useState(false);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [isHelpDetailOpen, setIsHelpDetailOpen] = useState(false);
  const [selectedHelpPost, setSelectedHelpPost] = useState<HelpPost | null>(null);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  return (
    <AppStateContext.Provider
      value={{
        hydrated,
        setHydrated,
        isLoggedIn,
        setIsLoggedIn,
        theme,
        setTheme,
        activeTab,
        setActiveTab,
        feedFilter,
        setFeedFilter,
        currentUser,
        setCurrentUser,
        users,
        setUsers,
        notifications,
        setNotifications,
        rides,
        setRides,
        helpPosts,
        setHelpPosts,
        conversations,
        setConversations,
        newsArticles,
        setNewsArticles,
        locationMode,
        setLocationMode,
        locationPermissionStatus,
        setLocationPermissionStatus,
        notificationPermissionStatus,
        setNotificationPermissionStatus,
        isDetectingLocation,
        setIsDetectingLocation,
        isNotificationsOpen,
        setIsNotificationsOpen,
        isLocationModalOpen,
        setIsLocationModalOpen,
        manualCityInput,
        setManualCityInput,
        isCreateMenuOpen,
        setIsCreateMenuOpen,
        isCreateRideModalOpen,
        setIsCreateRideModalOpen,
        isCreateHelpModalOpen,
        setIsCreateHelpModalOpen,
        isEditProfileOpen,
        setIsEditProfileOpen,
        isRideDetailOpen,
        setIsRideDetailOpen,
        selectedRideId,
        setSelectedRideId,
        isHelpDetailOpen,
        setIsHelpDetailOpen,
        selectedHelpPost,
        setSelectedHelpPost,
        activeConversation,
        setActiveConversation,
        selectedUserId,
        setSelectedUserId
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
};

export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
};
