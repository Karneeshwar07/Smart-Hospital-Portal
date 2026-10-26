import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  User,
  Stethoscope,
  X,
  AlertCircle,
  CheckCircle,
  Sun,
  Sunset,
  Moon,
  Lock,
  Filter,
  Check,
  Search
} from 'lucide-react';
import {
  ALL_10MIN_SLOTS,
  MORNING_SLOTS,
  AFTERNOON_SLOTS,
  EVENING_SLOTS,
  isSlotMatch,
  isSlotPast,
  getNextAvailableFutureSlot
} from '../utils/timeSlots';
import {
  getAllDoctors,
  getAllPatients,
  getDoctorAvailability,
  bookAppointment
} from '../services/api';
import { emitAppointmentCreated, emitSlotBooked } from '../services/socket';

const AppointmentSchedulingModal = ({
  isOpen,
  onClose,
  onSuccess,
  mode = 'doctor', // 'doctor' | 'admin' | 'patient'
  initialDoctorId = null,
  initialPatientId = null,
  currentUser = null
}) => {
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  // Form state
  const [selectedDoctorId, setSelectedDoctorId] = useState(initialDoctorId || '');
  const [selectedPatientId, setSelectedPatientId] = useState(initialPatientId || '');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [timeSlot, setTimeSlot] = useState('');
  const [symptoms, setSymptoms] = useState('General Consultation');
  const [isEmergency, setIsEmergency] = useState(false);

  // Slot states
  const [bookedSlots, setBookedSlots] = useState([]);
  const [slotLoading, setSlotLoading] = useState(false);
  const [activeSession, setActiveSession] = useState('all');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [slotSearch, setSlotSearch] = useState('');

  // Real-time clock tracker
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Synchronize with real-time clock every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Fetch initial doctors and patients when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setError('');
    setSuccess('');
    setTimeSlot('');

    const fetchData = async () => {
      setLoadingData(true);
      try {
        const [docsRes, patsRes] = await Promise.all([
          getAllDoctors().catch(() => ({ data: [] })),
          (mode === 'admin' || mode === 'doctor') ? getAllPatients().catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
        ]);

        setDoctors(docsRes.data || []);
        setPatients(patsRes.data || []);

        if (initialDoctorId) {
          setSelectedDoctorId(initialDoctorId);
        } else if (mode === 'doctor' && currentUser?._id) {
          setSelectedDoctorId(currentUser._id);
        } else if (docsRes.data?.length > 0 && !selectedDoctorId) {
          setSelectedDoctorId(docsRes.data[0]._id);
        }

        if (initialPatientId) {
          setSelectedPatientId(initialPatientId);
        } else if (patsRes.data?.length > 0 && !selectedPatientId) {
          setSelectedPatientId(patsRes.data[0]._id);
        }
      } catch (err) {
        console.error('Failed to load scheduling dependencies:', err);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, [isOpen, initialDoctorId, initialPatientId, mode]);

  // Fetch doctor booked slots when doctor or date changes
  useEffect(() => {
    if (!selectedDoctorId || !date || !isOpen) return;

    let isMounted = true;
    const fetchAvailability = async () => {
      setSlotLoading(true);
      try {
        const res = await getDoctorAvailability(selectedDoctorId, date);
        if (isMounted) {
          const fetchedBooked = res.data?.bookedSlots || [];
          setBookedSlots(fetchedBooked);

          // If current slot is not chosen or is in the past, pick next valid future slot
          const nextSlot = getNextAvailableFutureSlot(ALL_10MIN_SLOTS, date, fetchedBooked, Date.now());
          if (nextSlot) {
            setTimeSlot(nextSlot);
          }
        }
      } catch (err) {
        console.error('Failed to fetch doctor slot availability:', err);
        if (isMounted) setBookedSlots([]);
      } finally {
        if (isMounted) setSlotLoading(false);
      }
    };

    fetchAvailability();
    return () => {
      isMounted = false;
    };
  }, [selectedDoctorId, date, isOpen]);

  // Real-time calculation: Is selected slot in the past?
  const isSelectedSlotPast = useMemo(() => {
    if (!timeSlot || !date) return false;
    return isSlotPast(timeSlot, date, currentTime);
  }, [timeSlot, date, currentTime]);

  // Filter slots for UI
  const visibleSlots = useMemo(() => {
    let slots = ALL_10MIN_SLOTS;
    if (activeSession === 'morning') slots = MORNING_SLOTS;
    else if (activeSession === 'afternoon') slots = AFTERNOON_SLOTS;
    else if (activeSession === 'evening') slots = EVENING_SLOTS;

    // If onlyAvailable is checked, filter out both booked and past slots
    if (onlyAvailable) {
      slots = slots.filter((slot) => {
        const booked = bookedSlots.some((b) => isSlotMatch(b, slot));
        const passed = isSlotPast(slot, date, currentTime);
        return !booked && !passed;
      });
    }

    if (slotSearch.trim()) {
      const q = slotSearch.toLowerCase().trim();
      slots = slots.filter((s) => s.toLowerCase().includes(q));
    }

    return slots;
  }, [activeSession, onlyAvailable, slotSearch, bookedSlots, date, currentTime]);

  const availableCount = useMemo(() => {
    return ALL_10MIN_SLOTS.filter((slot) => {
      const booked = bookedSlots.some((b) => isSlotMatch(b, slot));
      const passed = isSlotPast(slot, date, currentTime);
      return !booked && !passed;
    }).length;
  }, [bookedSlots, date, currentTime]);

  const handleSlotClick = (slot) => {
    // Check if slot has already passed against real-time system clock
    if (isSlotPast(slot, date, Date.now())) {
      setError('Selected slot has already passed');
      return;
    }

    const isBooked = bookedSlots.some((b) => isSlotMatch(b, slot));
    if (isBooked) {
      setError(`Slot "${slot}" has already been reserved.`);
      return;
    }

    setTimeSlot(slot);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedDoctorId) {
      setError('Please select a consulting doctor.');
      return;
    }

    if ((mode === 'admin' || mode === 'doctor') && !selectedPatientId) {
      setError('Please select a patient for this appointment.');
      return;
    }

    if (!timeSlot) {
      setError('Please select an appointment time slot.');
      return;
    }

    // REQUIREMENT 1 & 3: Compare against real-time clock (Date.now())
    if (isSlotPast(timeSlot, date, Date.now())) {
      setError('Selected slot has already passed');
      return;
    }

    // Check concurrency
    const isBooked = bookedSlots.some((b) => isSlotMatch(b, timeSlot));
    if (isBooked) {
      setError(`Slot ${timeSlot} has already been reserved. Please pick another slot.`);
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        doctorId: selectedDoctorId,
        date,
        timeSlot,
        symptoms: symptoms.trim() || 'General Consultation',
        isEmergency,
        patientId: selectedPatientId || undefined
      };

      const res = await bookAppointment(payload);
      const created = res.data;

      // Broadcast real-time WebSocket events
      emitSlotBooked({
        doctorId: selectedDoctorId,
        date,
        slotTime: timeSlot,
        bookedBy: currentUser?.name || (mode === 'doctor' ? 'Consulting Doctor' : 'Hospital Admin')
      });
      emitAppointmentCreated(created);

      setSuccess(`Consultation booked successfully for ${timeSlot} on ${date}!`);
      if (onSuccess) onSuccess(created);

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to schedule appointment. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '92vh',
        overflowY: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={20} color="#0284c7" />
              {mode === 'doctor' ? 'Schedule Patient Consultation' : mode === 'admin' ? 'Admin Appointment Scheduling' : 'Book Consultation'}
            </h2>
            <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              Real-time slot locking active • Past times are strictly disabled
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              padding: '6px',
              cursor: 'pointer',
              color: '#64748b',
              borderRadius: '8px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          {error && (
            <div style={{
              padding: '12px 14px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '10px',
              color: '#b91c1c',
              fontSize: '13px',
              fontWeight: '700',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={18} /> {error}
            </div>
          )}

          {success && (
            <div style={{
              padding: '12px 14px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '10px',
              color: '#166534',
              fontSize: '13px',
              fontWeight: '700',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <CheckCircle size={18} /> {success}
            </div>
          )}

          {/* Doctors & Patients Selectors */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            {/* Doctor Picker */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                Consulting Doctor *
              </label>
              {mode === 'doctor' ? (
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: '#f1f5f9',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <Stethoscope size={16} color="#0284c7" />
                  {currentUser?.name || 'Dr. Specialist'} ({currentUser?.specialization || 'General OPD'})
                </div>
              ) : (
                <select
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <option value="">-- Choose Doctor --</option>
                  {doctors.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name} ({d.specialization || 'General'}) • ₹{d.consultationFee || 150}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Patient Picker (for Doctor and Admin) */}
            {(mode === 'doctor' || mode === 'admin') && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Patient *
                </label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <option value="">-- Select Patient --</option>
                  {patients.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} ({p.phone || p.email})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Date Picker & Slot Availability Status */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                Consultation Date *
              </label>
              <input
                type="date"
                required
                min={todayStr}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                Availability Summary
              </label>
              <div style={{
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569' }}>
                  <Clock size={16} color="#0284c7" />
                  {slotLoading ? 'Checking...' : `${availableCount} slots free`}
                </span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: availableCount > 0 ? '#dcfce7' : '#fee2e2',
                  color: availableCount > 0 ? '#15803d' : '#b91c1c'
                }}>
                  {availableCount > 0 ? 'Slots Available' : 'No Free Slots'}
                </span>
              </div>
            </div>
          </div>

          {/* 10-Minute Slots Section */}
          <div style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>
                  Select 10-Minute Granular Slot *
                </span>
                {timeSlot && (
                  <span style={{ marginLeft: '8px', fontSize: '12px', color: '#64748b' }}>
                    (Selected: <strong style={{ color: '#0284c7' }}>{timeSlot}</strong>)
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '12px', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={onlyAvailable}
                    onChange={(e) => setOnlyAvailable(e.target.checked)}
                  />
                  Available only
                </label>
                <input
                  type="text"
                  placeholder="Filter time..."
                  value={slotSearch}
                  onChange={(e) => setSlotSearch(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    width: '95px'
                  }}
                />
              </div>
            </div>

            {/* REQUIREMENT 3: Inline Error Message if selected slot has already passed */}
            {isSelectedSlotPast && (
              <div style={{
                padding: '8px 12px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                color: '#b91c1c',
                fontSize: '12px',
                fontWeight: '700',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <AlertCircle size={15} /> Selected slot has already passed
              </div>
            )}

            {/* Session Tabs */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '10px' }}>
              {[
                { id: 'all', label: 'All Slots' },
                { id: 'morning', label: 'Morning (09-12)' },
                { id: 'afternoon', label: 'Afternoon (02-05)' },
                { id: 'evening', label: 'Evening (05:30-07:30)' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSession(tab.id)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '16px',
                    fontSize: '11px',
                    fontWeight: '700',
                    border: '1px solid',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    backgroundColor: activeSession === tab.id ? '#0284c7' : '#ffffff',
                    borderColor: activeSession === tab.id ? '#0284c7' : '#cbd5e1',
                    color: activeSession === tab.id ? '#ffffff' : '#475569'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Slots Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '6px',
              maxHeight: '220px',
              overflowY: 'auto',
              padding: '6px',
              backgroundColor: '#f8fafc',
              borderRadius: '10px',
              border: '1px solid #e2e8f0'
            }}>
              {visibleSlots.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                  No available time slots matching this criteria.
                </div>
              ) : (
                visibleSlots.map((slot) => {
                  const isBooked = bookedSlots.some((b) => isSlotMatch(b, slot));
                  const isExpired = isSlotPast(slot, date, currentTime);
                  const isSelected = isSlotMatch(timeSlot, slot) && !isBooked && !isExpired;
                  const isDisabled = isBooked || isExpired;

                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => handleSlotClick(slot)}
                      style={{
                        padding: '8px 6px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '700',
                        textAlign: 'center',
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        border: isSelected
                          ? '2px solid #0284c7'
                          : isDisabled
                          ? '1px solid #e2e8f0'
                          : '1px solid #cbd5e1',
                        backgroundColor: isDisabled
                          ? '#f1f5f9'
                          : isSelected
                          ? '#0284c7'
                          : '#ffffff',
                        color: isDisabled
                          ? '#94a3b8'
                          : isSelected
                          ? '#ffffff'
                          : '#1e293b',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '2px',
                        opacity: isDisabled ? 0.65 : 1
                      }}
                    >
                      <span>{slot}</span>
                      {isBooked ? (
                        <span style={{ fontSize: '9px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <Lock size={9} /> Booked
                        </span>
                      ) : isExpired ? (
                        <span style={{ fontSize: '9px', color: '#b45309', display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <Clock size={9} /> Passed
                        </span>
                      ) : isSelected ? (
                        <span style={{ fontSize: '9px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <Check size={9} /> Selected
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Symptoms and Reason */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
              Reason / Symptoms
            </label>
            <input
              type="text"
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder="e.g., General Consultation, Fever, Follow-up..."
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#475569',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || isSelectedSlotPast || !timeSlot}
              style={{
                padding: '10px 22px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: (submitting || isSelectedSlotPast || !timeSlot) ? '#94a3b8' : '#0284c7',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: '700',
                cursor: (submitting || isSelectedSlotPast || !timeSlot) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {submitting ? 'Confirming...' : 'Confirm Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AppointmentSchedulingModal;
