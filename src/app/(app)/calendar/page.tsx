'use client';

// ============================================
// Calendar Page
// Monthly/weekly calendar with event management
// Day click opens DayPanel slide panel instead of directly opening the dialog
// ============================================
import { useState, useEffect } from 'react';
import { format, addMonths, subMonths, addWeeks, subWeeks, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import WeekView from '@/components/calendar/WeekView';
import EventDialog from '@/components/calendar/EventDialog';
import DayPanel from '@/components/calendar/DayPanel';
import { useEvents } from '@/lib/hooks/useEvents';
import { CalendarEvent, EventFormData } from '@/types';

export default function CalendarPage() {
  const { events, loading, createEvent, updateEvent, deleteEvent } = useEvents();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week'>('month');

  // Day panel state
  const [dayPanelDate, setDayPanelDate] = useState<Date | null>(null);

  // Launch date (from localStorage, same as dashboard)
  const [launchDate, setLaunchDate] = useState<Date | null>(null);
  useEffect(() => {
    const stored = localStorage.getItem('everest_launch_date');
    if (stored) setLaunchDate(parseISO(stored));
  }, []);

  // Dialog state (create / edit)
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [defaultDate, setDefaultDate]   = useState<string>('');

  // Navigation
  function goNext() {
    setCurrentDate(view === 'month' ? addMonths(currentDate, 1) : addWeeks(currentDate, 1));
  }
  function goPrev() {
    setCurrentDate(view === 'month' ? subMonths(currentDate, 1) : subWeeks(currentDate, 1));
  }
  function goToday() {
    setCurrentDate(new Date());
  }

  // Clicking a day opens the slide panel
  function handleDayClick(date: Date) {
    setDayPanelDate(date);
  }

  // Clicking an event from CalendarGrid / WeekView opens edit dialog
  function handleEventClick(event: CalendarEvent) {
    setSelectedEvent(event);
    setDefaultDate('');
    setDialogOpen(true);
  }

  // "Add Event" button in the panel header opens the create dialog pre-filled
  function handleAddFromPanel(date: string) {
    setSelectedEvent(null);
    setDefaultDate(date);
    setDialogOpen(true);
  }

  // "Edit Event" from DayPanel opens edit dialog
  function handleEditFromPanel(event: CalendarEvent) {
    setSelectedEvent(event);
    setDefaultDate('');
    setDialogOpen(true);
  }

  // Save handler (create or update)
  async function handleSave(data: EventFormData) {
    if (selectedEvent) {
      await updateEvent(selectedEvent.id, data);
    } else {
      await createEvent(data);
    }
  }

  // Delete handler
  async function handleDelete() {
    if (selectedEvent) {
      await deleteEvent(selectedEvent.id);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
          <p className="text-gray-500 text-sm">
            {format(currentDate, view === 'month' ? 'MMMM yyyy' : "'Week of' MMM d, yyyy")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              <CalendarDays className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Navigation */}
          <Button variant="outline" size="sm" onClick={goPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={goNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* Add event — opens dialog directly, today's date */}
          <Button
            size="sm"
            onClick={() => {
              setSelectedEvent(null);
              setDefaultDate(format(new Date(), 'yyyy-MM-dd'));
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Event
          </Button>
        </div>
      </div>

      {/* Calendar content */}
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : view === 'month' ? (
        <CalendarGrid
          currentMonth={currentDate}
          events={events}
          onDayClick={handleDayClick}
          onEventClick={handleEventClick}
        />
      ) : (
        <WeekView
          currentDate={currentDate}
          events={events}
          onDayClick={handleDayClick}
          onEventClick={handleEventClick}
        />
      )}

      {/* Day Panel — slides in from right when a day is clicked */}
      {dayPanelDate && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-40 sm:hidden"
            onClick={() => setDayPanelDate(null)}
          />
          <DayPanel
            date={dayPanelDate}
            events={events}
            launchDate={launchDate}
            onClose={() => setDayPanelDate(null)}
            onUpdateEvent={async (id, data) => { await updateEvent(id, data); }}
            onEditEvent={handleEditFromPanel}
            onAddEvent={handleAddFromPanel}
          />
        </>
      )}

      {/* Event create/edit dialog */}
      <EventDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setSelectedEvent(null);
        }}
        onSave={handleSave}
        onDelete={selectedEvent ? handleDelete : undefined}
        event={selectedEvent}
        defaultDate={defaultDate}
      />
    </div>
  );
}
