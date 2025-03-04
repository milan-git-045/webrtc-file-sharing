import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FileSharingComponent } from './file-sharing.component';

describe('FileSharingComponent', () => {
  let component: FileSharingComponent;
  let fixture: ComponentFixture<FileSharingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FileSharingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FileSharingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
