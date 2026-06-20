import * as service from '../../services/customer/subscription.service';
export async function createSubscriptionController(user: any, body: any){ return service.createSubscription(user.id, body); }
export async function listSubscriptionsController(user: any){ return service.listSubscriptions(user.id); }
export async function updateSubscriptionController(user: any, params: any, body: any){ return service.updateSubscription(user.id, params.id, body); }
export async function deleteSubscriptionController(user: any, params: any){ return service.deleteSubscription(user.id, params.id); }
