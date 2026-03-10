import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  fullScreen: {
    flex: 1
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  container: {
    flex: 1
  },
  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  brandIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center'
  },
  brandTitle: {
    marginLeft: 10,
    fontSize: 22,
    fontWeight: '900'
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  iconButton: {
    borderWidth: 1,
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  badgeCounter: {
    position: 'absolute',
    right: -4,
    top: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3
  },
  badgeCounterText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800'
  },
  cityChip: {
    marginLeft: 8,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 8,
    height: 34,
    alignItems: 'center',
    flexDirection: 'row'
  },
  cityChipText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4
  },
  feedToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3
  },
  feedToggleButton: {
    flex: 1,
    borderRadius: 10,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row'
  },
  feedToggleText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '800'
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 2.4,
    fontWeight: '900'
  },
  mainScroll: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 130
  },
  listWrap: {
    gap: 12
  },
  notificationListWrap: {
    gap: 12,
    padding: 14
  },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    gap: 10
  },
  rideCard: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginHorizontal: 10,
    marginTop: 8,
  },
  rideCardCover: {
    width: '100%',
    height: 150,
  },
  rideCardCoverImage: {
    width: '100%',
    height: '100%',
  },
  rideCardCoverOverlayTopLeft: {
    position: 'absolute',
    top: 10,
    left: 10,
  },
  rideCardDurationPill: {
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  rideCardDurationText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#000',
  },
  rideCardCoverOverlayTopRight: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  rideCardCoverOverlayBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  rideCardCoverOverlayBottomText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  rideCardBody: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  rideCardTitleRow: {},
  rideCardTitle: {
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rideCardRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rideCardRoutePointText: {
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },
  rideCardRouteLineContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  rideCardRouteDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rideCardRouteLine: {
    flex: 1,
    height: 2,
  },
  rideCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  rideCardMetaChip: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rideCardMetaChipText: {
    fontSize: 10,
    fontWeight: '600',
  },
  rideCardDivider: {
    height: 1,
    marginVertical: 4,
  },
  rideCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rideCardFooterLeft: {
    flex: 1,
  },
  rideCardFooterLabel: {
    fontSize: 10,
    marginBottom: 0,
  },
  rideCardCreatorName: {
    fontSize: 12,
    fontWeight: '700',
  },
  rideCardFooterRight: {
    alignItems: 'flex-end',
  },
  rideCardCostValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  rideCardCostSub: {
    fontSize: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800'
  },
  newsCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 12,
    gap: 12
  },
  newsImage: {
    width: '100%',
    height: 178,
    borderRadius: 14
  },
  newsImageFallback: {
    width: '100%',
    height: 178,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  newsImageFallbackContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  newsImageFallbackPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  newsImageFallbackPillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase'
  },
  newsImageFallbackSource: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 16
  },
  newsImageFallbackSubtext: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.25
  },
  newsMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8
  },
  newsTitle: {
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '900'
  },
  newsSummary: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '500'
  },
  newsReadMoreButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 34,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  newsReadMoreText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.35
  },
  newsTag: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  newsTagText: {
    fontSize: 11,
    fontWeight: '700'
  },
  newsScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  newsScoreChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  rowAligned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  rowAlignedTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  flex1: {
    flex: 1
  },
  avatarSmall: {
    width: 34,
    height: 34,
    borderRadius: 17
  },
  avatarTiny: {
    width: 22,
    height: 22,
    borderRadius: 11
  },
  avatarMedium: {
    width: 48,
    height: 48,
    borderRadius: 24
  },
  avatarLarge: {
    width: 74,
    height: 74,
    borderRadius: 24
  },
  boldText: {
    fontSize: 13,
    fontWeight: '700'
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center'
  },
  metaText: {
    fontSize: 11,
    fontWeight: '700'
  },
  mutedSmall: {
    fontSize: 12,
    fontWeight: '600'
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 19
  },
  statChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center'
  },
  statText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 5
  },
  routePreview: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    gap: 4
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 5
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700'
  },
  fabWrap: {
    position: 'absolute',
    right: 16,
    bottom: 84,
    alignItems: 'flex-end'
  },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1
  },
  createMenu: {
    marginBottom: 12,
    gap: 8,
    alignItems: 'flex-end'
  },
  createMenuButton: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 42,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center'
  },
  createMenuButtonText: {
    marginLeft: 8,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  emptyWrap: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800'
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center'
  },
  syncBanner: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  syncBannerContent: {
    flex: 1,
    gap: 2
  },
  syncBannerTitle: {
    fontSize: 12,
    fontWeight: '800'
  },
  syncBannerMessage: {
    fontSize: 11,
    lineHeight: 15
  },
  syncBannerRetry: {
    minWidth: 70,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5
  },
  syncBannerRetryText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  chatRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center'
  },
  unreadDot: {
    position: 'absolute',
    right: 0,
    top: 1,
    width: 10,
    height: 10,
    borderRadius: 5
  },
  chatInfo: {
    marginLeft: 12,
    flex: 1
  },
  chatPreview: {
    fontSize: 12,
    marginTop: 4
  },
  profileName: {
    fontSize: 21,
    fontWeight: '800'
  },
  profileStatsRow: {
    flexDirection: 'row',
    gap: 10
  },
  profileStatCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 68,
    padding: 8
  },
  profileStatValue: {
    fontSize: 20,
    fontWeight: '900'
  },
  profileStatLabel: {
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  cardHeader: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  pillTag: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  pillTagText: {
    fontSize: 12,
    fontWeight: '700'
  },
  gridTwo: {
    flexDirection: 'row',
    gap: 8
  },
  infoTile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 6
  },
  friendRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  preferenceRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  primaryButton: {
    borderRadius: 14,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row'
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 13,
    marginLeft: 8,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  dangerButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    backgroundColor: '#00000005'
  },
  dangerButtonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  modalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.72)'
  },
  sideSheet: {
    width: '92%',
    alignSelf: 'flex-end',
    height: '100%',
    borderLeftWidth: 1
  },
  modalHeader: {
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800'
  },
  newsReaderWebView: {
    flex: 1
  },
  newsReaderLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center'
  },
  newsReaderErrorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12
  },
  newsReaderErrorTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center'
  },
  newsReaderErrorText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19
  },
  modalFooter: {
    borderTopWidth: 1,
    padding: 14
  },
  ghostButton: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 46,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row'
  },
  ghostButtonText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '700'
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10
  },
  smallButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center'
  },
  smallButtonText: {
    fontSize: 11,
    fontWeight: '800'
  },
  chatMessagesWrap: {
    padding: 14,
    gap: 10,
    paddingBottom: 24
  },
  messageRow: {
    width: '100%'
  },
  messageLeft: {
    alignItems: 'flex-start'
  },
  messageRight: {
    alignItems: 'flex-end'
  },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    gap: 4
  },
  messageComposer: {
    borderTopWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  iconRoundButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center'
  },
  bottomSheet: {
    width: '100%',
    maxHeight: '92%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10
  },
  formSection: {
    paddingTop: 10,
    gap: 10,
    paddingBottom: 14
  },
  inputLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.7,
    fontWeight: '800',
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600'
  },
  inputMultiline: {
    minHeight: 96,
    paddingTop: 12
  },
  togglePhotoButton: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  selectorChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  selectorChipText: {
    fontSize: 11,
    fontWeight: '700'
  },
  organizerCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10
  },
  routeMapCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    gap: 10
  },
  routeMapFrame: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden'
  },
  routeMap: {
    width: '100%',
    height: 220
  },
  mapUnavailable: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10
  },
  routePointList: {
    gap: 8
  },
  routePointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  routePointDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  routePickerBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10
  },
  routePickerMapFrame: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden'
  },
  routePickerMap: {
    width: '100%',
    height: 300
  },
  routePickerActionRow: {
    flexDirection: 'row',
    gap: 8
  },
  routePickerActionButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center'
  },
  routePickerEmpty: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 70,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10
  },
  routePickerPointRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4
  },
  participantPill: {
    alignItems: 'center',
    gap: 4,
    minWidth: 58
  },
  requestRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  liveActionRow: {
    flexDirection: 'row',
    gap: 8
  },
  safetyActionButton: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 42,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6
  },
  safetyActionButtonText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  safetyHintCard: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10
  },
  liveParticipantList: {
    gap: 8
  },
  liveParticipantRow: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  liveStatusBadgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  liveStatusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 30,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  liveStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800'
  },
  sosAlertCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    gap: 8
  },
  sosAlertTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  statusStrip: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row'
  },
  statusStripText: {
    marginLeft: 8,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  helpImage: {
    width: '100%',
    height: 180,
    borderRadius: 14
  },
  replyCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 8
  },
  profileSheet: {
    width: '100%',
    maxHeight: '94%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    overflow: 'hidden'
  },
  profileCoverWrap: {
    height: 170
  },
  profileCover: {
    width: '100%',
    height: '100%'
  },
  profileCloseButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(2, 6, 23, 0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  userProfileContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 22,
    gap: 12
  },
  userTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: -42
  },
  userAvatarHuge: {
    width: 100,
    height: 100,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: '#fff'
  },
  primaryCompactButton: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 38,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row'
  },
  primaryCompactButtonText: {
    marginLeft: 5,
    fontSize: 11,
    fontWeight: '700'
  },
  loginScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20
  },
  loginCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 12
  },
  loginTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  themeToggleCompact: {
    flexDirection: 'row',
    gap: 7
  },
  themeSmallButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loginTitle: {
    fontSize: 32,
    fontWeight: '900'
  },
  loginSubtitle: {
    fontSize: 13,
    lineHeight: 18
  },
  linkText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700'
  },
  splashIcon: {
    width: 104,
    height: 104,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center'
  },
  splashBrand: {
    marginTop: 20,
    fontSize: 38,
    fontWeight: '900'
  },
  splashSubtitle: {
    marginTop: 8,
    fontSize: 11,
    letterSpacing: 4,
    fontWeight: '900'
  },
  squadSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  squadSearchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '600'
  },
  squadCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10
  },
  squadCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  squadAvatar: {
    width: 50,
    height: 50,
    borderRadius: 14
  },
  squadName: {
    fontSize: 16,
    fontWeight: '800'
  },
  squadMemberAvatars: {
    flexDirection: 'row',
    marginLeft: 4
  },
  squadMemberAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    marginLeft: -8
  },
  squadActionButton: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 38,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6
  },
  squadActionButtonText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  squadFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  squadFooterMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0
  },
  squadRideStyleTag: {
    flexShrink: 1,
    minWidth: 0
  },
  squadJoinModeTag: {
    flexShrink: 0
  },
  squadFooterAction: {
    flexShrink: 0
  },
  headerProfileButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    overflow: 'hidden'
  },
  headerProfileImage: {
    width: '100%',
    height: '100%'
  },
  profileCompleteTitle: {
    fontSize: 28,
    fontWeight: '900'
  },
  profileCompleteSectionLabel: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: 6
  },
  bloodGroupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  bloodGroupChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center'
  },
  bloodGroupChipText: {
    fontSize: 13,
    fontWeight: '700'
  }
});
