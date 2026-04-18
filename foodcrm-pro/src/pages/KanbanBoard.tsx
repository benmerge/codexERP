import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useAppContext } from '../data/AppContext';
import { PipelineStage, TaskStatus, Customer, Task } from '../types';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, User, Plus } from 'lucide-react';
import { EditCustomerDialog } from '../components/EditCustomerDialog';

const pipelineStages: PipelineStage[] = ['Lead', 'Contacted', 'Proposal', 'Closed Won', 'Closed Lost'];
const taskStatuses: TaskStatus[] = ['To Do', 'In Progress', 'Review', 'Done'];

export const KanbanBoard = () => {
  const { customers, tasks, updateCustomer, updateTask } = useAppContext();
  const [view, setView] = useState<'pipeline' | 'tasks'>('pipeline');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (view === 'pipeline') {
      const customer = customers.find(c => c.id === draggableId);
      if (customer) {
        const newStage = destination.droppableId as PipelineStage;
        const isProspect = newStage !== 'Closed Won' && newStage !== 'Closed Lost';
        
        updateCustomer({ ...customer, pipelineStage: newStage, isProspect });

        // Trigger email if moved to Closed Won
        if (newStage === 'Closed Won' && customer.pipelineStage !== 'Closed Won') {
          try {
            await fetch('/api/email/won', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                customerName: customer.name, 
                company: customer.company 
              })
            });
            // Optional: show a toast notification here
          } catch (error) {
            console.error('Failed to send win email:', error);
          }
        }
      }
    } else {
      const task = tasks.find(t => t.id === draggableId);
      if (task) {
        updateTask({ ...task, status: destination.droppableId as TaskStatus });
      }
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Kanban Board</h2>
          <p className="text-slate-500">Drag and drop to manage your pipeline or tasks.</p>
        </div>
        <div className="w-48">
          <Select value={view} onValueChange={(v: 'pipeline' | 'tasks') => setView(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select view" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pipeline">Manage Pipeline</SelectItem>
              <SelectItem value="tasks">Manage Tasks</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex h-full gap-4 items-start">
            {view === 'pipeline' ? (
              pipelineStages.map(stage => (
                <Column 
                  key={stage} 
                  id={stage} 
                  title={stage} 
                  items={customers.filter(c => c.pipelineStage === stage)} 
                  type="customer" 
                  onCustomerClick={(c) => setEditingCustomer(c)}
                />
              ))
            ) : (
              taskStatuses.map(status => (
                <Column 
                  key={status} 
                  id={status} 
                  title={status} 
                  items={tasks
                    .filter(t => t.status === status)
                    .sort((a, b) => {
                      // Sort by created date (newest first)
                      const dateA = a.createdAt || '';
                      const dateB = b.createdAt || '';
                      return dateB.localeCompare(dateA);
                    })
                  } 
                  type="task" 
                />
              ))
            )}
          </div>
        </DragDropContext>
      </div>

      <EditCustomerDialog 
        customer={editingCustomer} 
        open={!!editingCustomer} 
        onOpenChange={(open) => !open && setEditingCustomer(null)} 
        onSave={(updatedCustomer) => {
          updateCustomer(updatedCustomer);
          setEditingCustomer(null);
        }} 
      />
    </div>
  );
};

interface ColumnProps {
  id: string;
  title: string;
  items: (Customer | Task)[];
  type: 'customer' | 'task';
  onCustomerClick?: (customer: Customer) => void;
}

const Column = ({ id, title, items, type, onCustomerClick }: ColumnProps) => {
  return (
    <div className="flex flex-col bg-slate-100 rounded-lg w-72 shrink-0 max-h-full">
      <div className="p-3 font-semibold text-slate-700 flex justify-between items-center border-b border-slate-200">
        <span>{title}</span>
        <Badge variant="secondary" className="bg-slate-200 text-slate-700">{items.length}</Badge>
      </div>
      <Droppable droppableId={id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 p-3 overflow-y-auto space-y-3 min-h-[150px] transition-colors ${snapshot.isDraggingOver ? 'bg-slate-200/50' : ''}`}
          >
            {items.map((item, index) => (
              <Draggable key={item.id} draggableId={item.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    style={{ ...provided.draggableProps.style }}
                  >
                    {type === 'customer' ? (
                      <CustomerCard 
                        customer={item as Customer} 
                        isDragging={snapshot.isDragging} 
                        onClick={() => onCustomerClick && onCustomerClick(item as Customer)}
                      />
                    ) : (
                      <TaskCard task={item as Task} isDragging={snapshot.isDragging} />
                    )}
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};

const CustomerCard = ({ customer, isDragging, onClick }: { customer: Customer, isDragging: boolean, onClick?: () => void }) => {
  return (
    <Card 
      onClick={onClick}
      className={`shadow-sm border-slate-200 group relative ${onClick ? 'cursor-pointer hover:border-emerald-300' : ''} ${isDragging ? 'shadow-md ring-2 ring-emerald-500/20' : ''}`}
    >
      <CardContent className="p-3 space-y-2">
        <div className="font-medium text-sm pr-6 leading-tight">{customer.company || customer.name}</div>
        
        <button 
          onClick={(e) => { e.stopPropagation(); onClick?.(); }}
          className="absolute right-2 top-2 p-1.5 rounded-md text-emerald-600 bg-emerald-50 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-emerald-100 disabled:opacity-50"
          title="Add Note or Task"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        <div className="text-xs text-slate-500 flex items-center gap-1 line-clamp-1">
          <User className="w-3 h-3 shrink-0" /> <span className="truncate">{customer.company ? customer.name : 'Unknown Contact'}</span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-slate-50 mt-1">
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-slate-200 text-slate-500">
            {customer.category}
          </Badge>
          {customer.notes.length > 0 && (
            <span className="text-[10px] text-slate-400 font-medium">{customer.notes.length} note{customer.notes.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const TaskCard = ({ task, isDragging }: { task: Task, isDragging: boolean }) => {
  const { customers } = useAppContext();
  const customer = task.customerId ? customers.find(c => c.id === task.customerId) : null;

  return (
    <Card className={`shadow-sm border-slate-200 ${isDragging ? 'shadow-md ring-2 ring-emerald-500/20' : ''}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex justify-between items-start gap-2">
          <div className="font-medium text-sm leading-tight text-slate-900">{task.title}</div>
          {task.status === 'Done' && <Badge className="bg-emerald-100 text-emerald-700 border-none text-[9px] h-4">Done</Badge>}
        </div>

        <div className="grid grid-cols-1 gap-1.5 pt-1 border-t border-slate-50">
          {customer && (
            <div className="text-[11px] text-slate-600 flex items-center gap-1.5">
              <User className="w-3 h-3 text-slate-400" />
              <span className="font-medium text-slate-700">{customer.company || customer.name}</span>
            </div>
          )}
          
          <div className="flex items-center gap-3">
            {task.createdAt && (
              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                <span className="text-slate-400 uppercase font-semibold text-[8px]">Created:</span>
                {task.createdAt}
              </div>
            )}
            
            {task.dueDate && (
              <div className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {task.dueDate}
              </div>
            )}
          </div>
        </div>

        {task.description && task.description !== task.title && (
          <div className="text-[10px] text-slate-500 line-clamp-2 italic border-t border-slate-50 pt-1 mt-1">
            {task.description}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
