import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CreditCard, AlertTriangle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/config";
import { authenticatedFetch } from "@/lib/auth";

interface SubscriptionData {
  hasActiveSubscription: boolean;
  isExpired: boolean;
  daysUntilExpiry: number;
  subscription: {
    id: number;
    plan_name: string;
    status: string;
    end_date: string;
    monthly_price: number;
    organization_name: string;
  } | null;
}

const SubscriptionBanner = () => {
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchSubscriptionStatus();
    
    // Listen for subscription status updates from other components
    const handleSubscriptionUpdate = () => {
      fetchSubscriptionStatus();
    };
    
    // Add event listener for subscription updates
    window.addEventListener('subscriptionUpdated', handleSubscriptionUpdate);
    
    return () => {
      window.removeEventListener('subscriptionUpdated', handleSubscriptionUpdate);
    };
  }, []);

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/subscriptions/my-status`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setSubscriptionData(data);
    } catch (error) {
      console.error("Failed to fetch subscription status:", error);
      // Don't show error toast for subscription status as it's not critical
    } finally {
      setLoading(false);
    }
  };

  const handleContactSupport = () => {
    // Navigate to landing page and scroll to contact section
    navigate('/');
    // Use setTimeout to ensure navigation completes before scrolling
    setTimeout(() => {
      const contactSection = document.getElementById('contact');
      if (contactSection) {
        contactSection.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  const handleRenewSubscription = () => {
    // This could open a payment modal or redirect to payment page
    toast({
      title: "Renew Subscription",
      description: "Please contact support to renew your subscription.",
      variant: "default",
    });
  };

  if (loading) {
    return null;
  }

  if (!subscriptionData) {
    return null;
  }

  // Don't show banner if subscription is active and not expired
  if (subscriptionData.hasActiveSubscription && !subscriptionData.isExpired) {
    return null;
  }

  // Show expired subscription banner
  if (subscriptionData.isExpired || !subscriptionData.hasActiveSubscription) {
    return (
      <div className="mb-6">
        <Alert className="border-2 border-red-500 bg-red-50 shadow-md">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <AlertDescription className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <strong className="text-lg font-bold text-red-900">
                  Subscription Expired
                </strong>
                <div className="bg-red-600 text-white px-2 py-1 rounded text-xs font-medium">
                  Action Required
                </div>
              </div>
              <p className="text-base text-red-800 mb-2">
                Your subscription has expired. Please settle your payments to continue accessing the system.
              </p>
              {subscriptionData.subscription && (
                <div className="bg-white p-2 rounded border border-red-200">
                  <p className="text-sm text-red-700">
                    <span className="font-medium">Plan:</span> {subscriptionData.subscription.plan_name} | 
                    <span className="font-medium"> Expired:</span> {new Date(subscriptionData.subscription.end_date).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-3 ml-6">
              <Button
                onClick={handleRenewSubscription}
                className="bg-red-600 text-white hover:bg-red-700 font-medium"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Renew Now
              </Button>
              <Button
                variant="outline"
                onClick={handleContactSupport}
                className="border-red-500 text-red-700 hover:bg-red-50 font-medium"
              >
                Contact Support
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Show warning banner for subscription expiring soon (within 7 days)
  if (subscriptionData.daysUntilExpiry <= 7 && subscriptionData.daysUntilExpiry > 0) {
    return (
      <div className="mb-6">
        <Alert className="border-2 border-orange-500 bg-orange-50 shadow-md">
          <Clock className="h-5 w-5 text-orange-600" />
          <AlertDescription className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <strong className="text-lg font-bold text-orange-900">
                  Subscription Expiring Soon
                </strong>
                <div className="bg-orange-600 text-white px-2 py-1 rounded text-xs font-medium">
                  {subscriptionData.daysUntilExpiry} day{subscriptionData.daysUntilExpiry !== 1 ? 's' : ''} left
                </div>
              </div>
              <p className="text-base text-orange-800 mb-2">
                Your subscription expires in {subscriptionData.daysUntilExpiry} day{subscriptionData.daysUntilExpiry !== 1 ? 's' : ''}.
                Please renew to avoid service interruption.
              </p>
              {subscriptionData.subscription && (
                <div className="bg-white p-2 rounded border border-orange-200">
                  <p className="text-sm text-orange-700">
                    <span className="font-medium">Plan:</span> {subscriptionData.subscription.plan_name} | 
                    <span className="font-medium"> Expires:</span> {new Date(subscriptionData.subscription.end_date).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
            <div className="ml-6">
              <Button
                onClick={handleRenewSubscription}
                className="bg-orange-600 text-white hover:bg-orange-700 font-medium"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Renew Now
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return null;
};

export default SubscriptionBanner;
