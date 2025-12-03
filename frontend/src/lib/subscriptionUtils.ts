// Utility functions for subscription management

/**
 * Triggers a refresh of subscription status across all components
 * This should be called when subscription or organization status changes
 */
export const refreshSubscriptionStatus = () => {
  // Trigger refresh in DashboardLayout
  if (typeof (window as any).refreshSubscriptionStatus === 'function') {
    (window as any).refreshSubscriptionStatus();
  }
  
  // Trigger refresh in SubscriptionBanner and other components
  window.dispatchEvent(new CustomEvent('subscriptionUpdated'));
};

/**
 * Notify that subscription status has been updated
 * This will refresh the banner and navigation state
 */
export const notifySubscriptionUpdate = () => {
  refreshSubscriptionStatus();
};
