import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { RecordComponent } from './record/record.component';
import { ResultsComponent } from './results/results.component';


const routes: Routes = [
  {
    path: 'record',
    component: RecordComponent,
  },
  {
    path: 'results',
    component: ResultsComponent,
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: '/record',
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
