// Utils/EMI-Utils.js - EMI Calculations
export const getEmiDetails = (duration) => {
  const durations = {
    "6 months": 6,
    "1 year": 12,
    "2 years": 24
  };
  
  const months = durations[duration] || 0;
  return {
    eligible: months > 0,
    months,
    monthlyAmount: 2000,
    totalAmount: 2000 * months
  };
};

export const validateCourseForEmi = (course) => {
  const emiDetails = getEmiDetails(course.courseduration);
  
  if (!emiDetails.eligible) {
    throw new Error('EMI not available for this course duration');
  }
  
  if (course.price.finalPrice !== emiDetails.totalAmount) {
    throw new Error(`Course price must be ₹${emiDetails.totalAmount} for ${course.courseduration} EMI`);
  }
  
  return emiDetails;
};