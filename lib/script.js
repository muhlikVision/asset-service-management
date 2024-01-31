const ns='org.asm.uk';
/*
 * User places order
 * @param {org.asm.uk.placeLaptopOrder} placeLaptopOrder - laptop order
 * @transaction
 */
async function placeLaptopOrder(tx){
//create new order 
    var factory = await getFactory();
    var newOrder=factory.newResource(ns,'LaptopOrder',tx.orderId);
    newOrder.consumerCompany = tx.consumerCompany;
    newOrder.specs = tx.specs;
  	newOrder.quantity = tx.quantity;
    newOrder.status = 'ORDERED'; 
  	//check if the logged participant are inputing their correct id, not someone else's id
    chkCompany = new Boolean(false);
    await getParticipantRegistry(ns+'.Company')
  .then(function (participantRegistry) {
    // Determine if the specific company exists in the company participant registry.
    return participantRegistry.exists(tx.consumerCompany.CompanyId);
  })
  .then(function (exists) {
    // Process the boolean result.
      if(exists)
      {
        chkCompany = true;
      }
      else
      {
        throw new Error('Wrong CompanyId entered');
      }
  })
  .catch(function (error) {
    throw new Error(error);
  });
  
    if(chkCompany)
    {
  		const orderReg = await getAssetRegistry(ns+'.LaptopOrder');
        await orderReg.add(newOrder);
    }
 }


/*
 * technician/manager configs laptop order
 * @param {org.asm.uk.configureOrder} configureOrder - configure Order
 * @transaction
 */
async function  configureOrder (tx) {
      let factory = await getFactory();
  var queryResults = await query("laptopFetch", {orderId: tx.laptopConfigured.getIdentifier()});
 
  var fetchLapropDetails = await query("laptopDetailsFetch", {LapId: tx.laptopConfigured.getIdentifier()});
  
  if(queryResults.length > 0){
    let status = 0;
    
    queryResults.forEach(item=>status=item); //arrow function
    console.log(status);
    try{
      var newOrder=factory.newResource(ns,'LaptopDetail', tx.LapId);
      newOrder.laptopSpecs = factory.newConcept(ns, "specOutLaptop");
      newOrder.laptopSpecs.laptopBrand = status.specs.laptopBrand;
      newOrder.laptopSpecs.laptopCPU = status.specs.laptopCPU;
      newOrder.laptopSpecs.laptopGPU = status.specs.laptopGPU;
      newOrder.laptopSpecs.laptopStorage = status.specs.laptopStorage;
      newOrder.laptopSpecs.laptopMemory = status.specs.laptopMemory;
      newOrder.quantity = status.quantity;
      newOrder.laptopPrice = tx.laptopPrice;
      newOrder.orderId = tx.laptopConfigured;
      newOrder.laptopState = 'IN_STORAGE';
    }
    catch (exception) {
      throw new Error(exception);
  	}	
    
// add new order to the order registry
    const orderTaken = await getAssetRegistry(ns+'.LaptopDetail');
    await orderTaken.add(newOrder);
    
    
   //update order status from where technician was fetching the laptop for specs
    currentOrder = tx.laptopConfigured;
    if( currentOrder.status !== 'ORDERED')
    {
        throw new Error('Current order'+currentOrder.orderId+' is in wrong status to be configured');
    }
    else
    {
        currentOrder.status = 'CONFIGURED';
    }
// update order with current Order
    const orderReg = await getAssetRegistry(ns+'.LaptopOrder');
    await orderReg.update(currentOrder);
// emit the event
    const factory1=await getFactory();
    const configureOrderEvent=factory1.newEvent(ns,'configureOrderEvent');
    configureOrderEvent.laptopConfigured=currentOrder;
    emit(configureOrderEvent);
  }
  else{
    throw new Error("No order exists with the Id");
  }
}

/*
 * technician packages configured laptop
 * @param {org.asm.uk.packageOrder} packageOrder - package Order
 * @transaction
 */
async function packageOrder(tx){
  
    currentOrder = tx.laptopPackaged;
    if( currentOrder.status !== 'CONFIGURED')
    {
        throw new Error('Current order'+currentOrder.orderId+' is not ready yet for packaging');
    }
    else
    {
        currentOrder.status = 'READY_FOR_COLLECTION';
    }
// update order with current Order
    const orderReg = await getAssetRegistry(ns+'.LaptopOrder');
    await orderReg.update(currentOrder);
// emit the event
    const factory=await getFactory();
    const prepareOrderEvent=factory.newEvent(ns,'packageOrderEvent');
    prepareOrderEvent.laptopPackaged=currentOrder;
    emit(prepareOrderEvent);
}

/*
 * manager dispatches order
 * @param {org.asm.uk.dispatchOrder} dispatchOrder - dispatch Order
 * @transaction
 */
async function dispatchOrder(tx){
  	chkOrder = new Boolean(false);
  	
    currentOrder = tx.laptopDispatched;
    if( currentOrder.status !== 'READY_FOR_COLLECTION')
    {
      if (currentOrder.status == 'DELIVERED')
      {
        throw new Error('Current order'+currentOrder.orderId+' is already delivered');
      } else {
        throw new Error('Current order'+currentOrder.orderId+' is not ready for collection');
      }
    }
    else
    {
        currentOrder.status = 'DELIVERED';
      	chkOrder = true;
      	
    }
// update order with current Order
    const orderReg = await getAssetRegistry(ns+'.LaptopOrder');
    await orderReg.update(currentOrder);
// emit the event
    const factory=await getFactory();
    const dispatchOrderEvent=factory.newEvent(ns,'dispatchOrderEvent');
    dispatchOrderEvent.laptopDispatched=currentOrder;
  	
  	var currentOrderId = currentOrder.orderId;
  
    if(chkOrder == true)
    {
      currentOrder = tx.laptopRentedOut;
      if(currentOrder.orderId.getIdentifier() == currentOrderId)
      {
        if( currentOrder.laptopState == 'IN_STORAGE' || currentOrder.laptopState == 'REPAIRED')
        {
          currentOrder.laptopState = 'RENTED_OUT';
        }
        else
        {
          throw new Error('Laptop '+currentOrder.LapId+' isnt ready to be dispacthed yet. currently '+currentOrder.laptopState+'');
        }
      }
      else
      {
          throw new Error('The order '+currentOrderId+' has no Laptop '+currentOrder.LapId+' associated with it');
      }
  	// update order with current Order
      const orderReg = await getAssetRegistry(ns+'.LaptopDetail');
      await orderReg.update(currentOrder);
  	// emit the event
      
      dispatchOrderEvent.laptopRentedOut=currentOrder;
      emit(dispatchOrderEvent);

    }
    else
    {
		throw new Error('Current order hasnt been dispatched yet, cant move prepared laptop order from storage for renting process');
    }
  
}
/*
 * customer initiates return or repair request
 * @param {org.asm.uk.returnLaptop} returnLaptop - return Laptop
 * @transaction
 */
async function returnLaptop(tx){
  
  	currentOrder = tx.returnLaptop;
    var reason = tx.returnReason;
  
  	var fetchLapropDetails = await query("laptopDetailsFetch", {LapId: tx.returnLaptop.getIdentifier()});
  
      if(tx.returnReason == "repair")
      {
            if( currentOrder.laptopState !== 'RENTED_OUT')
              {
                    if (currentOrder.laptopState == 'IN_STORAGE') {
                        throw new Error('Current laptop '+currentOrder.LapId+' is already in lenders storag');
                      }
                    else if(currentOrder.laptopState == 'REPAIRS_REQUESTED'){
                         throw new Error('Current laptop '+currentOrder.LapId+' is already pending request for repairs');
                      }
                    else if(currentOrder.laptopState == 'RETURNED'){
                         throw new Error('Current laptop '+currentOrder.LapId+' is already returned');
                      }
                	else if(currentOrder.laptopState == 'RETURN_REQUESTED'){
                         throw new Error('Current laptop '+currentOrder.LapId+' is already in request for return');
                      }
                     else {
                         throw new Error('Current laptop '+currentOrder.LapId+' is already in repairs');
                      }
              }
              else
              {
                  currentOrder.laptopState = 'REPAIRS_REQUESTED';
              }
              // update order with current Order
                  const orderReg = await getAssetRegistry(ns+'.LaptopDetail');
                  await orderReg.update(currentOrder);
              // emit the event
                  const factory=await getFactory();
                  const returnLaptopEvent=factory.newEvent(ns,'returnLaptopEvent');
                  returnLaptopEvent.returnLaptop=currentOrder;
                  emit(returnLaptopEvent);
      }
      else if (tx.returnReason == "return")
      {
			 if( currentOrder.laptopState !== 'RENTED_OUT')
              {
                    if (currentOrder.laptopState == 'IN_STORAGE') {
                        throw new Error('Current laptop '+currentOrder.LapId+' is already in lenders storag');
                      }
                    else if(currentOrder.laptopState == 'REPAIRS_REQUESTED'){
                         throw new Error('Current laptop '+currentOrder.LapId+' is  pending request for repairs');
                      }
                    else if(currentOrder.laptopState == 'RETURNED'){
                         throw new Error('Current laptop '+currentOrder.LapId+' is already returned');
                      }
                	else if(currentOrder.laptopState == 'RETURN_REQUESTED'){
                         throw new Error('Current laptop '+currentOrder.LapId+' is already in request for return');
                      }
                     else {
                         throw new Error('Current laptop '+currentOrder.LapId+' is in repairs');
                      }
              }
              else
              {
                  currentOrder.laptopState = 'RETURN_REQUESTED';
              }
              // update order with current Order
                  const orderReg = await getAssetRegistry(ns+'.LaptopDetail');
                  await orderReg.update(currentOrder);
              // emit the event
                  const factory=await getFactory();
                  const returnLaptopEvent=factory.newEvent(ns,'returnLaptopEvent');
                  returnLaptopEvent.returnLaptop=currentOrder;
                  emit(returnLaptopEvent);
      }
       else
           {
           		throw new Error('Wrong reason entered, Please select between REPAIR or RETURN');
           }
    
  
}

//manager approval
/*
 * manager approves customers return or repair request
 * @param {org.asm.uk.laptopApproval} returnLaptop - return Laptop
 * @transaction
 */
async function laptopApproval(tx) {
  
      currentOrder = tx.laptopApproval;
        if( currentOrder.laptopState == 'REPAIRS_REQUESTED')
        {
          		currentOrder.laptopState = 'IN_REPAIRS';
          
                // update order with currentOrder
                const orderReg = await getAssetRegistry(ns+'.LaptopDetail');
                await orderReg.update(currentOrder);
            // emit the event
                const factory=await getFactory();
                const prepareOrderEvent=factory.newEvent(ns,'laptopApprovalEvent');
                prepareOrderEvent.laptopApproval=currentOrder;
                emit(prepareOrderEvent);
        }
        else if (currentOrder.laptopState == 'RETURN_REQUESTED')
        {
            	currentOrder.laptopState = 'RETURNED';
          
                // update order with current Order
                const orderReg = await getAssetRegistry(ns+'.LaptopDetail');
                await orderReg.update(currentOrder);
            	// emit the event
                const factory=await getFactory();
                const prepareOrderEvent=factory.newEvent(ns,'laptopApprovalEvent');
                prepareOrderEvent.laptopApproval=currentOrder;
                emit(prepareOrderEvent);
        }
  		else
        {
          	throw new Error('Invalid Laptop state, currently '+currentOrder.laptopState+'');
        }
  
}

/*
 * technician repairs laptop and makes it available for collection again
 * @param {org.asm.uk.repairLaptop} repairLaptop - repair Laptop
 * @transaction
 */
async function repairLaptop(tx) {
  
        currentOrder = tx.repairLaptop;
        if( currentOrder.laptopState == 'IN_REPAIRS')
        {
          		currentOrder.laptopState = 'REPAIRED';
          
                // update order with current Order
                const orderReg = await getAssetRegistry(ns+'.LaptopDetail');
                await orderReg.update(currentOrder);
            	// emit the event
                const factory=await getFactory();
                const prepareOrderEvent=factory.newEvent(ns,'repairLaptopEvent');
                prepareOrderEvent.repairLaptop=currentOrder;
                emit(prepareOrderEvent);
          
          		currentOrder.orderId.status = 'READY_FOR_COLLECTION';
          
                // update order with current Order
                const orderReg1 = await getAssetRegistry(ns+'.LaptopOrder');
                await orderReg1.update(currentOrder.orderId);
          		
        }
  		else
        {
          	throw new Error('Invalid Laptop state, currently '+currentOrder.laptopState+'');
        }
  
}

/*
 * technician places buy order for own asset service management company
 * @param {org.asm.uk.buyOrdertx} repairLaptop - buy Laptop
 * @transaction
 */

async function buyOrdertx(tx) {
  
    var factory = await getFactory();
      var newOrder=factory.newResource(ns,'BuyOrder',tx.buyId);
      newOrder.orderHandler = tx.orderHandler;
      newOrder.specs = tx.specs;
      newOrder.quantity = tx.quantity;
   	  newOrder.laptopPrice = tx.laptopPrice;
      newOrder.status = 'PENDING_APPROVAL';


      //check if the logged participant are inputing their correct id, not someone else's id
      chkCompany = new Boolean(false);

      await getParticipantRegistry(ns+'.Technician')
    .then(function (participantRegistry) {
      // Determine if the specific company exists in the company participant registry.
      return participantRegistry.exists(tx.orderHandler.tId);
    })
    .then(function (exists) {
      // Process the boolean result.
        if(exists)
        {
          chkCompany = true;
        }
        else
        {
          throw new Error('Wrong Technician ID entered');
        }
    })
    .catch(function (error) {
      throw new Error(error);
    });

      if(chkCompany)
      {
          const orderReg = await getAssetRegistry(ns+'.BuyOrder');
          await orderReg.add(newOrder);
      }
}
/*
 * CEO approves buy order for asset service management company
 * @param {org.asm.uk.buyOrderApproval} packageOrder - approve buy Order
 * @transaction
 */
async function buyOrderApproval(tx){
  
    currentOrder = tx.laptopApproval;
    if( currentOrder.status == 'PENDING_APPROVAL')
    {
      if(tx.decision == "approve"){
      	currentOrder.status = 'APPROVED';
      }
      else if (tx.decision == "decline")
      {
        currentOrder.status = 'DECLINED';
      }
      else
      {
         throw new Error('Wrong Decision Entered, please Enter APPROVE or DECLINE');
      }
    }
    else
    {
        throw new Error('Decision made already, status: '+currentOrder.status+'');
    }
// update order with current Order
    const orderReg = await getAssetRegistry(ns+'.BuyOrder');
    await orderReg.update(currentOrder);
// emit the event
    const factory=await getFactory();
    const prepareOrderEvent=factory.newEvent(ns,'buyOrderApprovalEvent');
    prepareOrderEvent.laptopApproval=currentOrder;
    emit(prepareOrderEvent);
}

/** 
*initialize participants
*@param {org.asm.uk.initializeALL} initializeAccountant - the InitializeAccountant transaction
*@transaction
*/
async function initializeALL() {
  
  //ACCOUNTANT
    // Get the participant registry for the Accountant.
    const participantRegistry = await getParticipantRegistry(ns+'.Accountant');
    try {
        // Create the Accountant participant.
        var accountant =await  getFactory().newResource(ns, 'Accountant', '3652');
        accountant.empName = await getFactory().newConcept(ns, 'Name');
        accountant.empName.name = 'Monzo';
        accountant.empAddress =await  getFactory().newConcept(ns, 'Address');
        accountant.empAddress.addressLine = 'The Burroughs, North Hendon';
        accountant.empAddress.City = 'London';
        accountant.empAddress.PostCode = 'NW44HE';
        accountant.empSalary = await getFactory().newConcept(ns,'Price');
        accountant.empSalary.price = 3000;
        accountant.empSalary.currency = '£';
    }
      catch (e)
      {
		throw new Error(e);
      }

    // Add the Accountant participant to the participant registry.
  try {
    //const orderReg = await getAssetRegistry(ns+'.BuyOrder');
    await participantRegistry.add(accountant);
  }
  catch (e)
  {
    throw new Error(e);
  }
    // COMPANY
    // Get the participant registry for the Company.
    const participantRegistry1 = await getParticipantRegistry('org.asm.uk.Company');

    // Create the Company participant.
    const company = await getFactory().newResource('org.asm.uk', 'Company', '0004');
    company.name =await  getFactory().newConcept('org.asm.uk', 'Name');
    company.name.name = 'NextBridge';
    company.address =await  getFactory().newConcept('org.asm.uk', 'Address');
    company.address.addressLine = 'The Burroughs, North Hendon';
    company.address.City = 'London';
    company.address.PostCode = 'NW44HE';

    // Add the Company participant to the participant registry.
    await participantRegistry1.add(company);
  
  //FOR MANAGER
 	const participantRegistry2 = await getParticipantRegistry('org.asm.uk.Manager');

    // Create the Manager participant.
    const manager = await getFactory().newResource('org.asm.uk', 'Manager', '1000');
    manager.empName =await  getFactory().newConcept('org.asm.uk', 'Name');
    manager.empName.name = 'Steve';
    manager.empAddress =await  getFactory().newConcept('org.asm.uk', 'Address');
    manager.empAddress.addressLine = 'The Burroughs, North Hendon';
    manager.empAddress.City = 'London';
    manager.empAddress.PostCode = 'NW44HE';
    manager.empSalary = await getFactory().newConcept('org.asm.uk', 'Price');
    manager.empSalary.price = 2000;
    manager.empSalary.currency = '£';

    // Add the Manager participant to the participant registry.
    await participantRegistry2.add(manager);
  
  //CEO
  	const participantRegistry3 = await getParticipantRegistry('org.asm.uk.CEO');

    // Create the CEO participant.
    const ceo =await  getFactory().newResource('org.asm.uk', 'CEO', '0001');
    ceo.empName =await  getFactory().newConcept('org.asm.uk', 'Name');
    ceo.empName.name = 'Dhanush';

    // Add the CEO participant to the participant registry.
    await participantRegistry3.add(ceo);
  
  //TECHNICIAN
  	const participantRegistry4 = await getParticipantRegistry('org.asm.uk.Technician');

    // Create the Technician participant.
    const technician =await  getFactory().newResource('org.asm.uk', 'Technician', '5001');
    technician.empName =await  getFactory().newConcept('org.asm.uk', 'Name');
    technician.empName.name = 'Jerry';
    technician.empAddress =await  getFactory().newConcept('org.asm.uk', 'Address');
    technician.empAddress.addressLine = 'The Burroughs, North Hendon';
    technician.empAddress.City = 'London';
    technician.empAddress.PostCode = 'NW44HE';
    technician.empSalary = await getFactory().newConcept('org.asm.uk', 'Price');
    technician.empSalary.price = 5000;
    technician.empSalary.currency = '£';

    // Add the Technician participant to the participant registry.
    await participantRegistry4.add(technician);

}
/** 
*A transaction processor function that initializes an Accountant participant.
*@param {org.asm.uk.initializeAsset} initializeAccountant - the InitializeAccountant transaction
*@transaction
*/
async function initializeAsset() {
  // Get the asset registry for the Laptop Detail.
    const assetRegistry = await getAssetRegistry('org.asm.uk.LaptopDetail');

    // Create the Laptop Detail asset.
    const laptopDetail = await getFactory().newResource('org.asm.uk', 'LaptopDetail', '9999');
    laptopDetail.laptopSpecs =await  getFactory().newConcept('org.asm.uk', 'specOutLaptop');
    laptopDetail.laptopSpecs.laptopBrand = 'DELL';
    laptopDetail.laptopSpecs.laptopCPU = 'Intel_Core2Duo';
    laptopDetail.laptopSpecs.laptopStorage = 'Harddisk';
    laptopDetail.laptopSpecs.laptopMemory = 'EightGigsStick';
    laptopDetail.laptopPrice =await  getFactory().newConcept('org.asm.uk', 'Price');
    laptopDetail.laptopPrice.price = 1200;
    laptopDetail.laptopPrice.currency = '£';
    laptopDetail.quantity = 10;
    laptopDetail.laptopState = 'RETURNED';
    laptopDetail.orderId = '1111';

    // Add the Laptop Detail asset to the asset registry.
    await assetRegistry.add(laptopDetail);
}
